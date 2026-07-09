"""
Bot Router - API endpoints for bot management

Configuración técnica de bots — responsabilidad exclusiva de administración
general (servicio gestionado, ver estrategia multi-tenant). El tenant no crea
ni configura sus propios bots; sólo prende/apaga módulos ya otorgados
(app/routers/tenant_router.py) y edita datos puntuales de entrenamiento.
"""

from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel
from typing import Any, Dict, Optional

from app.models.bot import BotCreate, BotUpdate, BotStatus
from app.services.bot_service import get_bot_service
from app.services.module_service import get_module_service
from app.services.ius_validator import validate_structure, validate_semantics
from app.auth_service import User
from app.dependencies.auth import get_current_user, require_role
from app.claude_service import build_effective_system_prompt, get_claude_service

router = APIRouter(
    prefix="/api/bots",
    tags=["bots"],
    dependencies=[Depends(require_role("super_admin"))],
)


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_bot(
    bot_data: BotCreate,
    current_user: User = Depends(get_current_user)
):
    """
    Crear un nuevo bot para un tenant

    - **tenant_id**: Tenant para el que se configura el bot
    - **name**: Nombre del bot
    - **description**: Descripción opcional
    - **business_type**: Tipo de negocio
    - **config**: Configuración del bot (opcional)
    """
    bot_service = get_bot_service()
    bot = await bot_service.create_bot(
        bot_data, owner_id=current_user.username, tenant_id=bot_data.tenant_id
    )

    for module_key in bot_data.module_keys or []:
        await get_module_service().grant_module(bot.bot_id, module_key, granted_by=current_user.username)

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
    tenant_id: Optional[str] = Query(None, description="Filtrar por tenant"),
):
    """Obtener lista de bots (todos los tenants, o filtrado por tenant_id)"""
    bot_service = get_bot_service()
    skip = (page - 1) * limit

    if tenant_id:
        result = await bot_service.get_bots_by_tenant(
            tenant_id=tenant_id, skip=skip, limit=limit, status=status
        )
    else:
        result = await bot_service.list_all_bots(skip=skip, limit=limit, status=status)

    return {
        "success": True,
        "bots": [b.model_dump() for b in result["bots"]],
        "total": result["total"],
        "page": result["page"],
        "pages": result["pages"],
        "limit": result["limit"]
    }


class ValidateIusConfigRequest(BaseModel):
    config: Dict[str, Any]
    semantic: bool = False


@router.post("/validate-ius-config", response_model=dict)
async def validate_ius_config(body: ValidateIusConfigRequest):
    """
    Valida el JSON de configuración libre de un agente (ius_config) antes de
    guardarlo. Los chequeos estructurales (genéricos + campos conocidos por
    el runtime) siempre corren; el análisis semántico vía LLM es opcional
    porque implica una llamada a la API de Claude.
    """
    structural = validate_structure(body.config)
    semantic = []
    if body.semantic:
        try:
            claude_client = get_claude_service().client
        except Exception as e:
            semantic = [{
                "field": "$",
                "message": f"No se pudo inicializar el servicio de IA: {e}",
                "severity": "error",
            }]
        else:
            semantic = await validate_semantics(body.config, claude_client)

    return {"success": True, "structural": structural, "semantic": semantic}


@router.get("/{bot_id}", response_model=dict)
async def get_bot(bot_id: str):
    """Obtener un bot por ID"""
    bot_service = get_bot_service()
    bot = await bot_service.get_bot(bot_id)

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
async def update_bot(bot_id: str, update_data: BotUpdate):
    """Actualizar un bot"""
    bot_service = get_bot_service()

    existing = await bot_service.get_bot(bot_id)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bot no encontrado"
        )

    bot = await bot_service.update_bot_admin(bot_id, update_data)

    return {
        "success": True,
        "message": "Bot actualizado",
        "bot": bot.model_dump()
    }


@router.delete("/{bot_id}", response_model=dict)
async def delete_bot(bot_id: str):
    """Eliminar un bot (soft delete)"""
    bot_service = get_bot_service()

    existing = await bot_service.get_bot(bot_id)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bot no encontrado"
        )

    deleted = await bot_service.delete_bot_admin(bot_id)

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
async def get_bot_stats(bot_id: str):
    """Obtener estadísticas de un bot"""
    bot_service = get_bot_service()

    existing = await bot_service.get_bot(bot_id)
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
async def debug_system_prompt(bot_id: str):
    """
    Muestra el system prompt efectivo que Claude recibe para este bot,
    junto con el estado de la configuración (ius_config, flow, system_prompt).
    Solo para debugging — requiere autenticación.
    """
    bot_service = get_bot_service()
    bot = await bot_service.get_bot(bot_id)
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
