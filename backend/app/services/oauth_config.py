"""
Configuración compartida de Nango (devbout_oauth) para gestion.ar.

Usada tanto por google_oauth_router.py (login/alta de administración
general, sin autoregistro) como por tenant_oauth_router.py (login/alta
self-service de usuarios de tenant) — ver ambos routers.
"""
import os

from devbout_oauth import NangoConfig


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
