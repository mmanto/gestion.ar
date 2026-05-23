"""
Bot Router - API endpoints for bot management
"""

from fastapi import APIRouter, HTTPException, Depends, Query, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional

from app.models.bot import BotCreate, BotUpdate, BotStatus
from app.services.bot_service import get_bot_service
from app.auth_service import get_current_user_from_token, User
from app.claude_service import build_effective_system_prompt

router = APIRouter(prefix="/api/bots", tags=["bots"])

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


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_bot(
    bot_data: BotCreate,
    current_user: User = Depends(get_current_user)
):
    """
    Crear un nuevo bot

    - **name**: Nombre del bot
    - **description**: Descripción opcional
    - **business_type**: Tipo de negocio
    - **config**: Configuración del bot (opcional)
    """
    bot_service = get_bot_service()
    bot = await bot_service.create_bot(bot_data, owner_id=current_user.username)

    return {
        "success": True,
        "message": "Bot creado exitosamente",
        "bot": bot.model_dump()
    }


@router.get("", response_model=dict)
async def get_bots(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[BotStatus] = Query(None),
    current_user: User = Depends(get_current_user)
):
    """Obtener lista de bots del usuario"""
    bot_service = get_bot_service()
    skip = (page - 1) * limit

    result = await bot_service.get_bots_by_owner(
        owner_id=current_user.username,
        skip=skip,
        limit=limit,
        status=status
    )

    return {
        "success": True,
        "bots": [b.model_dump() for b in result["bots"]],
        "total": result["total"],
        "page": result["page"],
        "pages": result["pages"],
        "limit": result["limit"]
    }


@router.get("/{bot_id}", response_model=dict)
async def get_bot(
    bot_id: str,
    current_user: User = Depends(get_current_user)
):
    """Obtener un bot por ID"""
    bot_service = get_bot_service()
    bot = await bot_service.get_bot_by_owner(bot_id, current_user.username)

    if not bot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bot no encontrado"
        )

    return {
        "success": True,
        "bot": bot.model_dump()
    }


@router.put("/{bot_id}", response_model=dict)
async def update_bot(
    bot_id: str,
    update_data: BotUpdate,
    current_user: User = Depends(get_current_user)
):
    """Actualizar un bot"""
    bot_service = get_bot_service()

    # Verificar que el bot existe y pertenece al usuario
    existing = await bot_service.get_bot_by_owner(bot_id, current_user.username)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bot no encontrado"
        )

    bot = await bot_service.update_bot(bot_id, current_user.username, update_data)

    return {
        "success": True,
        "message": "Bot actualizado",
        "bot": bot.model_dump()
    }


@router.delete("/{bot_id}", response_model=dict)
async def delete_bot(
    bot_id: str,
    current_user: User = Depends(get_current_user)
):
    """Eliminar un bot (soft delete)"""
    bot_service = get_bot_service()

    existing = await bot_service.get_bot_by_owner(bot_id, current_user.username)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bot no encontrado"
        )

    deleted = await bot_service.delete_bot(bot_id, current_user.username)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al eliminar el bot"
        )

    return {
        "success": True,
        "message": "Bot eliminado"
    }


@router.get("/{bot_id}/stats", response_model=dict)
async def get_bot_stats(
    bot_id: str,
    current_user: User = Depends(get_current_user)
):
    """Obtener estadísticas de un bot"""
    bot_service = get_bot_service()

    existing = await bot_service.get_bot_by_owner(bot_id, current_user.username)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bot no encontrado"
        )

    stats = await bot_service.get_bot_stats(bot_id)

    return {
        "success": True,
        "stats": stats
    }


@router.get("/{bot_id}/debug-prompt")
async def debug_system_prompt(
    bot_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Muestra el system prompt efectivo que Claude recibe para este bot,
    junto con el estado de la configuración (ius_config, flow, system_prompt).
    Solo para debugging — requiere autenticación.
    """
    bot_service = get_bot_service()
    bot = await bot_service.get_bot_by_owner(bot_id, current_user.username)
    if not bot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot no encontrado")

    effective_prompt = build_effective_system_prompt(bot.config)

    return {
        "effective_system_prompt": effective_prompt,
        "prompt_length_chars": len(effective_prompt),
        "sources": {
            "has_ius_config": bot.config.ius_config is not None,
            "ius_config_keys": list(bot.config.ius_config.keys()) if bot.config.ius_config else [],
            "has_system_prompt": bool(bot.config.system_prompt),
            "system_prompt_preview": (bot.config.system_prompt or "")[:200],
            "flow_enabled": bool(bot.config.flow and bot.config.flow.enabled),
            "flow_steps_count": len(bot.config.flow.steps) if bot.config.flow and bot.config.flow.steps else 0,
        }
    }
