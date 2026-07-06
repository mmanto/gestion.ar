"""
Tenant Router - Backoffice de tenant (UsuarioAdmin / Usuario).

El tenant NO crea ni configura técnicamente sus bots (eso es administración
general, ver bot_router.py/tenant_admin_router.py) — sólo puede:
1. Ver un resumen de sus propios bots (read-only).
2. Habilitar/deshabilitar módulos ya otorgados por administración general.
3. Editar datos puntuales de entrenamiento (custom_facts, ej. honorarios).

Ver estrategia multi-tenant en docs/dev/DECISIONS.md.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth_service import User
from app.dependencies.auth import get_current_user, require_role
from app.models.bot import BotStatus, BotUpdate
from app.models.tenant import CustomFactsUpdate, ModuleEnableRequest
from app.services.bot_service import get_bot_service
from app.services.module_service import get_module_service

router = APIRouter(prefix="/api/tenant", tags=["tenant"])


async def _verify_tenant_bot(bot_id: str, current_user: User):
    bot = await get_bot_service().get_bot(bot_id)
    if not bot or not current_user.tenant_id or bot.tenant_id != current_user.tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bot no encontrado")
    return bot


@router.get("/bots", response_model=dict)
async def get_tenant_bots(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status_filter: BotStatus = Query(None, alias="status"),
    current_user: User = Depends(get_current_user),
):
    """Resumen read-only de los bots del propio tenant (nombre/estado)."""
    skip = (page - 1) * limit
    result = await get_bot_service().get_bots_by_tenant(
        tenant_id=current_user.tenant_id, skip=skip, limit=limit, status=status_filter
    )
    return {
        "success": True,
        "bots": [
            {"bot_id": b.bot_id, "name": b.name, "status": b.status, "business_type": b.business_type}
            for b in result["bots"]
        ],
        "total": result["total"],
        "page": result["page"],
        "pages": result["pages"],
        "limit": result["limit"],
    }


@router.get("/bots/{bot_id}/modules", response_model=dict)
async def get_bot_modules(bot_id: str, current_user: User = Depends(get_current_user)):
    """Módulos del bot (otorgados y su estado enabled/disabled)."""
    await _verify_tenant_bot(bot_id, current_user)
    items = await get_module_service().get_bot_modules(bot_id)
    return {"success": True, "modules": [m.model_dump() for m in items]}


@router.patch("/bots/{bot_id}/modules/{module_key}", response_model=dict)
async def set_module_enabled(
    bot_id: str,
    module_key: str,
    body: ModuleEnableRequest,
    current_user: User = Depends(require_role("admin")),
):
    """Habilita/deshabilita un módulo ya otorgado por administración general.
    403 si el módulo no fue otorgado (no se puede "agregar" un módulo nuevo)."""
    await _verify_tenant_bot(bot_id, current_user)

    try:
        result = await get_module_service().set_enabled(bot_id, module_key, body.enabled)
    except (ValueError, LookupError) as e:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(e))

    return {"success": True, "module": result.model_dump()}


@router.get("/bots/{bot_id}/training/custom-facts", response_model=dict)
async def get_custom_facts(bot_id: str, current_user: User = Depends(require_role("admin"))):
    """Datos puntuales de entrenamiento vigentes (ej. honorarios a informar)."""
    bot = await _verify_tenant_bot(bot_id, current_user)
    return {"success": True, "custom_facts": bot.config.custom_facts}


@router.patch("/bots/{bot_id}/training/custom-facts", response_model=dict)
async def update_custom_facts(
    bot_id: str,
    body: CustomFactsUpdate,
    current_user: User = Depends(require_role("admin")),
):
    """Edita datos puntuales de entrenamiento (ej. honorarios a informar).
    No toca system_prompt/ius_config/flow — eso es de administración general."""
    bot = await _verify_tenant_bot(bot_id, current_user)

    bot_service = get_bot_service()
    updated_config = bot.config.model_copy(update={"custom_facts": body.custom_facts})
    updated = await bot_service.update_bot_admin(bot_id, BotUpdate(config=updated_config))

    return {"success": True, "custom_facts": updated.config.custom_facts}
