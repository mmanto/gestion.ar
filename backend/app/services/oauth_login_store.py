"""
Estado efímero (Redis) del login OAuth nativo (mobile), indexado por nonce_id.

En web el popup de Nango avisa "listo" via window.opener.postMessage — eso no
funciona cuando el OAuth corre en Chrome Custom Tabs (proceso separado, sin
window.opener hacia el WebView de la app). Para mobile, en cambio:
  1. Al crear la connect session (tenant_login_session) se guarda un registro
     "pending" con el tenant_id/provider de ese login, ya que el webhook de
     Nango solo trae el nonce_id (end_user.id) y el connectionId, no el
     tenant_id.
  2. El webhook de Nango (login_webhook) resuelve ese pending, hace el mismo
     trabajo que /finalize, y guarda el resultado final.
  3. El frontend hace polling a /connect/login/status con el nonce firmado
     hasta ver el resultado — peek_result lo deja disponible hasta el TTL (no
     lo borra al leerlo: un pop dejaría el login 'pending' para siempre si la
     request que lo consumió se aborta al retomar la WebView, ver
     auth.service.ts).

Requiere Redis compartido entre workers (backend corre con --workers 2 en
prod, ver docker-compose.prod.yml) — un dict en memoria no alcanzaría porque
el webhook y el polling pueden caer en workers distintos.
"""
import json
import logging
import os
from typing import Optional

import redis

logger = logging.getLogger(__name__)

_TTL_SECONDS = 300  # igual al vencimiento del nonce de login (ver state.py)
_KEY_PREFIX = "oauth_login:"


class OAuthLoginStore:
    def __init__(self) -> None:
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        try:
            self._client: Optional[redis.Redis] = redis.from_url(redis_url, decode_responses=True)
            self._client.ping()
        except Exception:
            logger.error("OAuthLoginStore: no se pudo conectar a Redis (%s) — login OAuth nativo deshabilitado", redis_url)
            self._client = None

    def _key(self, nonce_id: str) -> str:
        return f"{_KEY_PREFIX}{nonce_id}"

    def save_pending(self, nonce_id: str, tenant_id: str, provider: str) -> None:
        if not self._client:
            return
        payload = {"status": "pending", "tenant_id": tenant_id, "provider": provider}
        self._client.setex(self._key(nonce_id), _TTL_SECONDS, json.dumps(payload))

    def get_pending(self, nonce_id: str) -> Optional[dict]:
        """Lee el registro sin borrarlo — lo usa el webhook para saber a qué tenant pertenece."""
        if not self._client:
            return None
        raw = self._client.get(self._key(nonce_id))
        if not raw:
            return None
        data = json.loads(raw)
        return data if data.get("status") == "pending" else None

    def resolve_success(self, nonce_id: str, result: dict) -> None:
        if not self._client:
            return
        payload = {"status": "done", **result}
        self._client.setex(self._key(nonce_id), _TTL_SECONDS, json.dumps(payload))

    def resolve_error(self, nonce_id: str, message: str) -> None:
        if not self._client:
            return
        payload = {"status": "error", "message": message}
        self._client.setex(self._key(nonce_id), _TTL_SECONDS, json.dumps(payload))

    def peek_result(self, nonce_id: str) -> Optional[dict]:
        """Devuelve el resultado terminal (done/error) sin borrarlo.

        A diferencia de un fetch-and-delete (pop), un peek sobrevive a requests
        que el servidor procesa pero cuyo response el cliente nunca recibe: al
        volver del Chrome Custom Tab, la primera request de la WebView se aborta
        (ver auth.service.ts) y, si esa request había consumido el resultado,
        el polling quedaba 'pending' para siempre aunque el webhook hubiera
        resuelto el login. Con peek, el retry del cliente vuelve a leer el
        resultado intacto. La exposición queda acotada por el TTL del registro
        y por el vencimiento del nonce firmado que autoriza leerlo.
        """
        if not self._client:
            return None
        raw = self._client.get(self._key(nonce_id))
        if not raw:
            return None
        data = json.loads(raw)
        if data.get("status") == "pending":
            # El registro pending es interno (tenant_id/provider) — no se expone.
            return None
        return data


_store: Optional[OAuthLoginStore] = None


def get_oauth_login_store() -> OAuthLoginStore:
    global _store
    if _store is None:
        _store = OAuthLoginStore()
    return _store
