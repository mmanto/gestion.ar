"""
Tenant OAuth Router - Login + alta self-service de usuarios de tenant, vía
Nango (Google/Microsoft).

A diferencia de google_oauth_router.py (administración general, sin
autoregistro — toda cuenta la crea super_admin), acá un usuario nuevo SÍ
puede darse de alta automáticamente la primera vez que completa el flujo,
siempre scoped al tenant_id que originó la sesión de login (ver
TenantContext en frontend-tenant, resuelto por contenedor/dominio).

No reusa devbout_oauth.create_router porque su nonce de login no lleva
contexto de tenant — acá se firma un nonce propio (mismo signing key, otro
`purpose`) que sí lo lleva, y se delega en
UserService.find_or_create_tenant_user (que, a diferencia de
find_or_create_by_identity, crea la cuenta si no existe).
"""
import hashlib
import hmac
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, HTTPException, Request, status
from jose import JWTError, jwt
from pydantic import BaseModel

from app.services.oauth_config import build_nango_config
from app.services.oauth_login_store import get_oauth_login_store
from app.services.tenant_service import get_tenant_service
from app.services.user_service import get_user_service
from devbout_oauth import NangoClient, NangoError
from devbout_oauth.identity import fetch_identity

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tenant/oauth", tags=["tenant-oauth"])

_config = build_nango_config()
_nango = NangoClient(_config)
_login_store = get_oauth_login_store()

# Distinta de NANGO_SECRET_KEY (esa autentica llamadas HACIA la API de
# Nango) — esta es la "Webhook Signing Key" de Environment Settings en el
# dashboard de Nango, usada para verificar que un webhook entrante viene
# realmente de Nango. Se configura manualmente: en el dashboard del Nango
# self-hosted, Environment Settings -> Webhook URL apuntando a
# <API_URL>/api/tenant/oauth/webhook/nango, y copiar la Webhook Signing Key
# acá.
_WEBHOOK_SECRET = os.getenv("NANGO_WEBHOOK_SECRET", "")

_ALGORITHM = "HS256"
_EXPIRE_MINUTES = 5
_PURPOSE = "tenant_oauth_signup"


def _create_nonce(tenant_id: str) -> tuple[str, str]:
    """Return (nonce_id, signed_token). nonce_id is used as Nango end_user.id."""
    nonce_id = f"tsignup_{uuid.uuid4().hex}"
    payload = {
        "sub": nonce_id,
        "tenant_id": tenant_id,
        "purpose": _PURPOSE,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=_EXPIRE_MINUTES),
    }
    return nonce_id, jwt.encode(payload, _config.state_signing_key, algorithm=_ALGORITHM)


def _verify_nonce(token: str) -> tuple[str, str]:
    """Return (nonce_id, tenant_id), or raise HTTP 400 if invalid/expired."""
    try:
        payload = jwt.decode(token, _config.state_signing_key, algorithms=[_ALGORITHM])
        if payload.get("purpose") != _PURPOSE:
            raise ValueError("not a tenant signup nonce")
        return payload["sub"], payload["tenant_id"]
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sesión de login inválida o expirada")


def _integration_key(provider: str) -> str:
    if provider == "google":
        return _config.google_integration_key
    if provider == "microsoft":
        return _config.microsoft_integration_key
    raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Provider no soportado: {provider}")


class _SessionRequest(BaseModel):
    tenant_id: str
    provider: str


class _FinalizeRequest(BaseModel):
    connectionId: str
    provider: str
    nonce: str


class _LoginError(Exception):
    """Error de negocio al completar un login OAuth — mensaje ya en español, listo para mostrar."""

    def __init__(self, message: str, status_code: int = status.HTTP_502_BAD_GATEWAY) -> None:
        super().__init__(message)
        self.status_code = status_code


async def _create_connect_session_with_link(
    nonce_id: str, integration_key: str,
) -> tuple[str, str]:
    """
    Como devbout_oauth.NangoClient.create_connect_session descarta el
    `connect_link` (solo devuelve el token), se llama a la API de Nango
    directo acá para tenerlo — es el "magic link" que en mobile se abre en
    Chrome Custom Tabs en vez del iframe+popup (ver auth.service.ts).
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{_config.nango_host.rstrip('/')}/connect/sessions",
            headers={
                "Authorization": f"Bearer {_config.nango_secret_key}",
                "Content-Type": "application/json",
            },
            json={"end_user": {"id": nonce_id}, "allowed_integrations": [integration_key]},
        )
    if resp.status_code >= 300:
        logger.error("Nango create_connect_session failed: %s %s", resp.status_code, resp.text)
        raise NangoError(f"connect/sessions returned {resp.status_code}")
    data = resp.json()["data"]
    return data["token"], data["connect_link"]


async def _complete_tenant_login(
    tenant_id: str, provider: str, connection_id: str, expected_nonce_id: str | None = None,
) -> dict:
    """
    Resuelve una connection de Nango ya autorizada en un login de tenant:
    identidad del proveedor -> alta/lookup de usuario -> token de la app.
    Usado tanto por /finalize (flujo web, dispara el frontend) como por el
    webhook (flujo mobile, dispara Nango del lado del servidor).

    Si se pasa expected_nonce_id, se verifica que la connection pertenezca a
    ese login (protege /finalize de que le pasen un connectionId ajeno); el
    webhook no lo necesita porque ya llegó indexado por ese mismo nonce_id.
    """
    integration_key = _integration_key(provider)
    try:
        conn = await _nango.get_connection(connection_id, integration_key)
    except NangoError as e:
        raise _LoginError(f"El login con {provider} no está disponible en este momento") from e

    if expected_nonce_id is not None:
        end_user_id = (conn.get("end_user") or {}).get("id", "")
        if end_user_id != expected_nonce_id:
            raise _LoginError("Connection no coincide con la sesión", status.HTTP_400_BAD_REQUEST)

    access_token = (conn.get("credentials") or {}).get("access_token", "")
    identity = await fetch_identity(provider, access_token)
    if not identity.email or not identity.provider_user_id:
        raise _LoginError("No se pudo obtener la identidad del proveedor")

    user_service = get_user_service()
    try:
        username, app_token = await user_service.find_or_create_tenant_user(
            tenant_id, identity.provider, identity.provider_user_id,
            identity.email, identity.given_name, identity.family_name,
        )
    except ValueError as e:
        raise _LoginError(str(e)) from e

    await user_service.save_connection(username, provider, connection_id, identity.email)
    return {
        "token": app_token,
        "email": identity.email,
        "given_name": identity.given_name,
        "family_name": identity.family_name,
        "provider": provider,
    }


@router.post("/connect/login/session")
async def tenant_login_session(body: _SessionRequest):
    tenant = await get_tenant_service().get_tenant(body.tenant_id)
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant no encontrado")
    if tenant.status == "suspended":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tenant suspendido")

    integration_key = _integration_key(body.provider)
    nonce_id, nonce_token = _create_nonce(body.tenant_id)
    try:
        session_token, connect_link = await _create_connect_session_with_link(nonce_id, integration_key)
    except NangoError as e:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"El login con {body.provider} no está disponible en este momento",
        ) from e

    # Registro pendiente: el webhook de Nango solo trae nonce_id (end_user.id)
    # y connectionId, no el tenant_id — lo necesita para find_or_create_tenant_user.
    _login_store.save_pending(nonce_id, body.tenant_id, body.provider)

    return {
        "sessionToken": session_token,
        "connectLink": connect_link,
        "nonce": nonce_token,
        "provider": body.provider,
        "providerConfigKey": integration_key,
    }


@router.post("/connect/login/finalize")
async def tenant_login_finalize(body: _FinalizeRequest):
    nonce_id, tenant_id = _verify_nonce(body.nonce)
    try:
        return await _complete_tenant_login(tenant_id, body.provider, body.connectionId, nonce_id)
    except _LoginError as e:
        raise HTTPException(e.status_code, str(e)) from e


@router.post("/webhook/nango")
async def tenant_oauth_webhook(request: Request):
    """
    Contraparte server-side de /connect/login/session para el flujo mobile:
    Nango llama acá cuando una connection termina de autorizarse (evento
    "auth"), y no hay que esperar el postMessage del popup (que en Custom
    Tabs no llega nunca, ver auth.service.ts). Configurar en el dashboard
    del Nango self-hosted: Environment Settings -> Webhook URL.
    """
    raw = await request.body()
    if _WEBHOOK_SECRET:
        signature = request.headers.get("X-Nango-Signature", "")
        expected = hmac.new(_WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Firma de webhook inválida")
    else:
        logger.warning("tenant_oauth_webhook: NANGO_WEBHOOK_SECRET no seteado — aceptando sin verificar firma")

    payload = await request.json()
    if payload.get("type") != "auth" or payload.get("operation") != "creation":
        return {"ok": True}

    nonce_id = (payload.get("endUser") or {}).get("endUserId", "")
    connection_id = payload.get("connectionId", "")
    if not nonce_id or not connection_id:
        return {"ok": True}

    pending = _login_store.get_pending(nonce_id)
    if not pending:
        # Nonce ya resuelto/expirado, o un end_user que no vino de este login
        # (ej. el flujo de "email connect" autenticado usa otro end_user.id).
        return {"ok": True}

    if not payload.get("success"):
        message = (payload.get("error") or {}).get("description") or "No se pudo completar el login"
        _login_store.resolve_error(nonce_id, message)
        return {"ok": True}

    try:
        result = await _complete_tenant_login(pending["tenant_id"], pending["provider"], connection_id)
        _login_store.resolve_success(nonce_id, result)
    except _LoginError as e:
        _login_store.resolve_error(nonce_id, str(e))
    except Exception:
        logger.exception("tenant_oauth_webhook: error inesperado completando login (nonce=%s)", nonce_id)
        _login_store.resolve_error(nonce_id, "Error inesperado completando el login")

    return {"ok": True}


@router.get("/connect/login/status")
async def tenant_login_status(nonce: str):
    """Polling del frontend mobile mientras el usuario autoriza en Chrome Custom Tabs."""
    nonce_id, _tenant_id = _verify_nonce(nonce)
    result = _login_store.pop_result(nonce_id)
    if result is None:
        return {"status": "pending"}
    return result
