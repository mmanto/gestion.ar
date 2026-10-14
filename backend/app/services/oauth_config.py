"""
Configuración compartida de Nango (devbout_oauth) para gestion.ar.

Usada tanto por google_oauth_router.py (login/alta de administración
general, sin autoregistro) como por tenant_oauth_router.py (login/alta
self-service de usuarios de tenant) — ver ambos routers.
"""
import os
from urllib.parse import urlparse

from devbout_oauth import NangoConfig, PasskeyConfig


def build_nango_config() -> NangoConfig:
    return NangoConfig(
        nango_host=os.getenv("NANGO_HOST", "http://localhost:3003"),
        nango_secret_key=os.getenv("NANGO_SECRET_KEY", ""),
        frontend_url=os.getenv("FRONTEND_URL", "http://localhost:5173"),
        state_signing_key=os.getenv("STATE_SIGNING_KEY")
        or os.getenv("GOOGLE_STATE_SIGNING_KEY")
        or os.getenv("ENCRYPTION_KEY", ""),
        google_integration_key=os.getenv("GOOGLE_INTEGRATION_KEY", "google-mail"),
        microsoft_integration_key=os.getenv("MICROSOFT_INTEGRATION_KEY", "microsoft"),
    )


def configured_passkey_origins() -> list[str]:
    """Origins declarados por entorno (`WEBAUTHN_ORIGINS`, separados por coma).

    Existen para el único caso en que la página **no** está en el dominio del
    tenant: el dev-server de Vite (`http://localhost:5174`) con el tenant
    forzado por `?tenant=<id>`. En prod la lista queda vacía y el dominio de la
    página sale del origen de cada request (ver `build_passkey_config`).
    """
    return [
        origin.strip().rstrip("/")
        for origin in os.getenv("WEBAUTHN_ORIGINS", "").split(",")
        if origin.strip()
    ]


def passkey_allowed_hosts() -> set[str]:
    """Hosts con passkeys declarados por entorno (ver `configured_passkey_origins`)."""
    return {(urlparse(origin).hostname or "").lower() for origin in configured_passkey_origins()} - {""}


def build_passkey_config(origin: str) -> PasskeyConfig:
    """Config WebAuthn (passkeys: Face ID, huella, Windows Hello) de `origin`.

    `origin` es el origen de la **página** que inicia la ceremonia, no el del
    API: WebAuthn ata cada passkey a un dominio y el navegador rechaza con
    `SecurityError` cualquier ceremonia cuyo `rpId` no sea ese dominio (o un
    sufijo suyo). Con un RP ID global, la misma SPA servida en el dominio de
    cada tenant (`pachoteayuda.ar`, `ius.intellify.pro`, …) no podía crear ni
    usar passkeys en ninguno de esos dominios. Por eso el RP ID se deriva del
    origen de la página y el backend solo acepta hosts que sirven una
    organización (ver `_passkey_config` en `tenant_passkey_router`).

    Los origins declarados por entorno se suman a los del mismo host, para
    tolerar otras variantes del dominio (p. ej. otro puerto en dev).
    """
    parsed = urlparse(origin)
    rp_id = (parsed.hostname or "").lower()
    if parsed.scheme not in ("http", "https") or not rp_id:
        raise ValueError(f"origin de WebAuthn inválido: {origin!r}")
    extra_origins = [
        configured
        for configured in configured_passkey_origins()
        if (urlparse(configured).hostname or "").lower() == rp_id
    ]
    return PasskeyConfig(
        rp_id=rp_id,
        rp_name=os.getenv("WEBAUTHN_RP_NAME", "Gestion.ar"),
        origins=list(dict.fromkeys([origin] + extra_origins)),
        user_verification=os.getenv("WEBAUTHN_USER_VERIFICATION", "preferred"),
    )
