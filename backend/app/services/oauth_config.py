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


def build_passkey_config() -> PasskeyConfig:
    """Config WebAuthn (passkeys: Face ID, huella, Windows Hello).

    El RP ID y los origins salen del frontend público: WebAuthn exige que el
    dominio que firma la credencial sea el mismo que sirve la página y no
    acepta IPs, así que en dev `FRONTEND_URL` tiene que ser
    `http://localhost:5173` (RP ID `localhost`). `WEBAUTHN_RP_ID` y
    `WEBAUTHN_ORIGINS` (separados por coma) los sobreescriben, por ejemplo para
    habilitar también el subdominio de un tenant.
    """
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    origins = [origin.strip() for origin in os.getenv("WEBAUTHN_ORIGINS", "").split(",") if origin.strip()]
    return PasskeyConfig(
        rp_id=os.getenv("WEBAUTHN_RP_ID") or (urlparse(frontend_url).hostname or "localhost"),
        rp_name=os.getenv("WEBAUTHN_RP_NAME", "Gestion.ar"),
        origins=origins or [frontend_url],
        user_verification=os.getenv("WEBAUTHN_USER_VERIFICATION", "preferred"),
    )
