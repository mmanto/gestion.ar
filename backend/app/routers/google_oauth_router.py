"""
Login + integraciones (Google/Microsoft) para gestion.ar, vía Nango.

Usa devbout_oauth.create_router con un GestionConnectionStorage que delega en
UserService (SQLAlchemy async, sesión por operación).
Nango custodia y refresca los tokens del proveedor.
"""
import os

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.auth_service import verify_token
from app.services.user_service import get_user_service
from devbout_oauth import ConnectionStorage, NangoConfig, create_router

_security = HTTPBearer()


# ── Storage adapter ───────────────────────────────────────────────────────────

class GestionConnectionStorage:
    """ConnectionStorage para gestion.ar: delega en UserService (PostgreSQL/SQLAlchemy)."""

    async def save_connection(
        self, user_id: str, provider: str, connection_id: str, email: str
    ) -> None:
        await get_user_service().save_connection(user_id, provider, connection_id, email)

    async def get_connection(self, user_id: str):
        return await get_user_service().get_connection(user_id)

    async def clear_connection(self, user_id: str) -> None:
        await get_user_service().clear_connection(user_id)

    async def find_or_create_by_identity(
        self, provider: str, provider_user_id: str, email: str, given_name: str, family_name: str
    ) -> tuple[str, str]:
        return await get_user_service().find_or_create_by_identity(
            provider, provider_user_id, email, given_name, family_name
        )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_config() -> NangoConfig:
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


async def _get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(_security),
) -> str:
    payload = verify_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
        )
    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    return username


# ── Router ────────────────────────────────────────────────────────────────────

router = create_router(
    config=_build_config(),
    storage=GestionConnectionStorage(),
    get_current_user_id=_get_current_user_id,
    prefix="/api/auth/oauth",
)
