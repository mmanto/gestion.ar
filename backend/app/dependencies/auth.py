"""
Dependencia de autenticación/autorización centralizada.

Reemplaza las definiciones locales duplicadas de `security`/`get_current_user`
que existían en main.py y en cada router (bot_router, client_router,
channel_router, document_router, appointments_router, pwa_router,
web_chat_router) — ver estrategia multi-tenant, Fase 2.

Fase 4 agrega `require_role(...)` y `get_current_tenant` para el modelo de
roles (super_admin / admin / operativo) y el aislamiento por tenant_id.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.auth_service import get_current_user_from_token, User
from app.db.models import Tenant as TenantModel
from app.db.database import AsyncSessionLocal

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> User:
    """Dependency para obtener el usuario actual desde el token JWT.

    Refetchea el usuario desde la base en cada request (no confía únicamente
    en los claims del JWT) para que cambios de estado del lado del servidor
    (deshabilitar un usuario, suspender un tenant) tengan efecto inmediato,
    sin esperar a que expire el token.
    """
    user = await get_current_user_from_token(credentials.credentials)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def require_role(*roles: str):
    """Dependency factory: 403 si el usuario actual no tiene uno de los
    roles indicados. Uso: `Depends(require_role("super_admin"))`."""

    async def _check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tenés permisos para realizar esta acción",
            )
        return current_user

    return _check


async def get_current_tenant(current_user: User = Depends(get_current_user)) -> TenantModel:
    """Dependency: carga el tenant del usuario actual y rechaza si está
    suspendido. No aplica a super_admin (sin tenant propio)."""
    if not current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El usuario no pertenece a ningún tenant",
        )

    async with AsyncSessionLocal() as session:
        tenant = await session.get(TenantModel, current_user.tenant_id)

    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant no encontrado")
    if tenant.status == "suspended":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant suspendido")

    return tenant
