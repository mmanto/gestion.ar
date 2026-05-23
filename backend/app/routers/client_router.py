"""
Client Router - API endpoints for client management
"""

from fastapi import APIRouter, HTTPException, Depends, Query, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional

from app.models.client import ClientUpdate, ClientStatus
from app.services.client_service import get_client_service
from app.services.bot_service import get_bot_service
from app.auth_service import get_current_user_from_token, User

router = APIRouter(prefix="/api/bots/{bot_id}/clients", tags=["clients"])

# Esquema de seguridad HTTP Bearer
security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> User:
    """Dependency para obtener el usuario actual desde el token JWT"""
    token = credentials.credentials
    user = await get_current_user_from_token(token)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


async def verify_bot_access(bot_id: str, current_user: User):
    """Verificar acceso al bot"""
    bot_service = get_bot_service()
    bot = await bot_service.get_bot_by_owner(bot_id, current_user.username)

    if not bot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bot no encontrado"
        )

    return bot


@router.get("", response_model=dict)
async def get_clients(
    bot_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[ClientStatus] = Query(None),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user)
):
    """Obtener clientes de un bot"""
    await verify_bot_access(bot_id, current_user)

    client_service = get_client_service()
    skip = (page - 1) * limit

    result = await client_service.get_clients_by_bot(
        bot_id=bot_id,
        skip=skip,
        limit=limit,
        status=status,
        search=search
    )

    return {
        "success": True,
        "clients": [c.model_dump() for c in result["clients"]],
        "total": result["total"],
        "page": result["page"],
        "pages": result["pages"],
        "limit": result["limit"]
    }


@router.get("/{client_id}", response_model=dict)
async def get_client(
    bot_id: str,
    client_id: str,
    current_user: User = Depends(get_current_user)
):
    """Obtener un cliente por ID"""
    await verify_bot_access(bot_id, current_user)

    client_service = get_client_service()
    client = await client_service.get_client(client_id)

    if not client or client.bot_id != bot_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente no encontrado"
        )

    return {
        "success": True,
        "client": client.model_dump()
    }


@router.put("/{client_id}", response_model=dict)
async def update_client(
    bot_id: str,
    client_id: str,
    update_data: ClientUpdate,
    current_user: User = Depends(get_current_user)
):
    """Actualizar un cliente"""
    await verify_bot_access(bot_id, current_user)

    client_service = get_client_service()
    existing = await client_service.get_client(client_id)

    if not existing or existing.bot_id != bot_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente no encontrado"
        )

    client = await client_service.update_client(client_id, update_data)

    return {
        "success": True,
        "message": "Cliente actualizado",
        "client": client.model_dump()
    }


@router.post("/{client_id}/block", response_model=dict)
async def block_client(
    bot_id: str,
    client_id: str,
    current_user: User = Depends(get_current_user)
):
    """Bloquear un cliente"""
    await verify_bot_access(bot_id, current_user)

    client_service = get_client_service()
    existing = await client_service.get_client(client_id)

    if not existing or existing.bot_id != bot_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente no encontrado"
        )

    blocked = await client_service.block_client(client_id)

    if not blocked:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al bloquear el cliente"
        )

    return {
        "success": True,
        "message": "Cliente bloqueado"
    }


@router.post("/{client_id}/unblock", response_model=dict)
async def unblock_client(
    bot_id: str,
    client_id: str,
    current_user: User = Depends(get_current_user)
):
    """Desbloquear un cliente"""
    await verify_bot_access(bot_id, current_user)

    client_service = get_client_service()
    existing = await client_service.get_client(client_id)

    if not existing or existing.bot_id != bot_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente no encontrado"
        )

    unblocked = await client_service.unblock_client(client_id)

    if not unblocked:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al desbloquear el cliente"
        )

    return {
        "success": True,
        "message": "Cliente desbloqueado"
    }


@router.get("/{client_id}/conversations", response_model=dict)
async def get_client_conversations(
    bot_id: str,
    client_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user)
):
    """Obtener conversaciones de un cliente"""
    await verify_bot_access(bot_id, current_user)

    client_service = get_client_service()
    existing = await client_service.get_client(client_id)

    if not existing or existing.bot_id != bot_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente no encontrado"
        )

    # TODO: Integrar con conversation_service para obtener conversaciones filtradas
    # Por ahora retornamos una estructura vacía
    return {
        "success": True,
        "conversations": [],
        "total": 0,
        "page": page,
        "pages": 0,
        "limit": limit
    }
