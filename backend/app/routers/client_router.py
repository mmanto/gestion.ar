"""
Client Router - API endpoints for client management

Visibilidad por rol (ver docs/dev/DECISIONS.md — cada abogado tiene su
propio canal/link, y los clientes que entran por ahí quedan asignados a él,
ver ClientService.get_or_create_client):
  - admin/super_admin: todos los clientes del tenant.
  - broker: los propios + los de los operativos con broker_username = él.
  - operativo: solo los propios (owner_username = su username).
"""

from fastapi import APIRouter, HTTPException, Depends, Query, status
from typing import List, Optional

from app.models.client import ClientUpdate, ClientStatus
from app.services.client_service import get_client_service
from app.services.bot_service import get_bot_service
from app.services.user_service import get_user_service
from app.conversation_service import get_conversation_service
from app.auth_service import User
from app.dependencies.auth import get_current_user, require_role

router = APIRouter(prefix="/api/bots/{bot_id}/clients", tags=["clients"])


async def verify_bot_access(bot_id: str, current_user: User):
    """Verificar que el bot pertenezca al tenant del usuario autenticado
    (admin y operativo del tenant pueden ver/gestionar clientes/leads)."""
    bot_service = get_bot_service()
    bot = await bot_service.get_bot(bot_id)

    if not bot or bot.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bot no encontrado"
        )

    return bot


async def _verify_client_access(client, current_user: User) -> None:
    """404 (no 403: no revelar que el cliente existe) si el cliente no
    pertenece al alcance del usuario actual — ver UserService.get_scoped_owner_usernames."""
    owner_usernames = await get_user_service().get_scoped_owner_usernames(current_user)
    if owner_usernames is not None and client.owner_username not in owner_usernames:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cliente no encontrado")


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
        search=search,
        owner_usernames=await get_user_service().get_scoped_owner_usernames(current_user),
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
    await _verify_client_access(client, current_user)

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
    await _verify_client_access(existing, current_user)

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
    current_user: User = Depends(require_role("admin", "super_admin"))
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
    current_user: User = Depends(require_role("admin", "super_admin"))
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
    await _verify_client_access(existing, current_user)

    conv_service = get_conversation_service()
    result = await conv_service.get_all_conversations(
        bot_id=bot_id,
        client_id=client_id,
        skip=(page - 1) * limit,
        limit=limit,
    )

    return {
        "success": True,
        "conversations": result["conversations"],
        "total": result["total"],
        "page": result["page"],
        "pages": result["pages"],
        "limit": result["limit"],
    }
