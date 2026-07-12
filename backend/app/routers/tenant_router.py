"""
Tenant Router - Backoffice de tenant (UsuarioAdmin / Usuario).

El tenant NO crea ni configura técnicamente sus bots (eso es administración
general, ver bot_router.py/tenant_admin_router.py) — sólo puede:
1. Ver un resumen de sus propios bots (read-only).
2. Habilitar/deshabilitar módulos ya otorgados por administración general.
3. Editar datos puntuales de entrenamiento (custom_facts, ej. honorarios) y,
   en bots tipo IUS, qué colores del semáforo cierra solo el agente
   (auto_qualify_colors, ver prospect_auto_qualify_service.py).
4. Gestionar (alta/edición) los usuarios de su propio tenant — nunca
   super_admin, y siempre scoped a current_user.tenant_id.

Ver estrategia multi-tenant en docs/dev/DECISIONS.md.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth_service import User
from app.dependencies.auth import get_current_user, require_role
from app.models.bot import BotStatus, BotUpdate
from app.models.tenant import AutoQualifyColorsUpdate, CustomFactsUpdate, ModuleEnableRequest, TenantOwnUserCreate, TenantUserOut, TenantUserUpdate
from app.services.bot_service import get_bot_service
from app.services.module_service import get_module_service
from app.services.user_service import get_user_service

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
async def get_custom_facts(bot_id: str, current_user: User = Depends(require_role("admin", "operativo"))):
    """Datos puntuales de entrenamiento vigentes (ej. honorarios a informar)."""
    bot = await _verify_tenant_bot(bot_id, current_user)
    return {"success": True, "custom_facts": bot.config.custom_facts}


@router.patch("/bots/{bot_id}/training/custom-facts", response_model=dict)
async def update_custom_facts(
    bot_id: str,
    body: CustomFactsUpdate,
    current_user: User = Depends(require_role("admin", "operativo")),
):
    """Edita datos puntuales de entrenamiento (ej. honorarios a informar).
    No toca system_prompt/ius_config/flow — eso es de administración general."""
    bot = await _verify_tenant_bot(bot_id, current_user)

    bot_service = get_bot_service()
    updated_config = bot.config.model_copy(update={"custom_facts": body.custom_facts})
    updated = await bot_service.update_bot_admin(bot_id, BotUpdate(config=updated_config))

    return {"success": True, "custom_facts": updated.config.custom_facts}


@router.get("/bots/{bot_id}/training/auto-qualify-colors", response_model=dict)
async def get_auto_qualify_colors(bot_id: str, current_user: User = Depends(require_role("admin", "operativo"))):
    """Colores del semáforo habilitados para conversión automática (crear Prospect
    solo, ver prospect_auto_qualify_service.py) — específico de bots tipo IUS."""
    bot = await _verify_tenant_bot(bot_id, current_user)
    return {"success": True, "auto_qualify_colors": bot.config.auto_qualify_colors}


@router.patch("/bots/{bot_id}/training/auto-qualify-colors", response_model=dict)
async def update_auto_qualify_colors(
    bot_id: str,
    body: AutoQualifyColorsUpdate,
    current_user: User = Depends(require_role("admin", "operativo")),
):
    """Edita los colores del semáforo para los que el agente crea el Prospect solo."""
    bot = await _verify_tenant_bot(bot_id, current_user)

    bot_service = get_bot_service()
    updated_config = bot.config.model_copy(update={"auto_qualify_colors": body.colors})
    updated = await bot_service.update_bot_admin(bot_id, BotUpdate(config=updated_config))

    return {"success": True, "auto_qualify_colors": updated.config.auto_qualify_colors}


# ── Usuarios del propio tenant (UsuarioAdmin/Usuario) ───────────────────────
# A diferencia de /api/admin/users (administración general, cualquier tenant),
# estos endpoints están siempre scoped a current_user.tenant_id — un
# UsuarioAdmin no puede ver ni tocar usuarios de otro tenant, ni crear un
# super_admin.

def _user_out(user_in_db) -> TenantUserOut:
    return TenantUserOut(
        username=user_in_db.username,
        email=user_in_db.email,
        nombre=user_in_db.nombre,
        apellido=user_in_db.apellido,
        avatar_url=user_in_db.avatar_url,
        tenant_id=user_in_db.tenant_id,
        role=user_in_db.role,
        disabled=user_in_db.disabled,
    )


@router.get("/users", response_model=dict)
async def get_tenant_users(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_role("admin")),
):
    """Lista los usuarios del propio tenant."""
    skip = (page - 1) * limit
    result = await get_user_service().list_users(
        tenant_id=current_user.tenant_id, skip=skip, limit=limit
    )
    return {
        "success": True,
        "users": [_user_out(u).model_dump() for u in result["users"]],
        "total": result["total"],
        "page": result["page"],
        "pages": result["pages"],
        "limit": result["limit"],
    }


@router.post("/users", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_tenant_own_user(
    data: TenantOwnUserCreate,
    current_user: User = Depends(require_role("admin")),
):
    """Crea un usuario en el propio tenant. tenant_id se fuerza al del
    usuario autenticado — no se acepta tenant_id en el body."""
    if data.role == "super_admin":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No se puede crear un super_admin desde el tenant")

    user_service = get_user_service()
    try:
        user = await user_service.create_user(
            username=data.username,
            password=data.password,
            email=data.email,
            nombre=data.nombre,
            apellido=data.apellido,
            avatar_url=data.avatar_url,
            tenant_id=current_user.tenant_id,
            role=data.role.value if hasattr(data.role, "value") else data.role,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

    return {"success": True, "user": _user_out(user).model_dump()}


@router.patch("/users/{username}", response_model=dict)
async def update_tenant_own_user(
    username: str,
    data: TenantUserUpdate,
    current_user: User = Depends(require_role("admin")),
):
    """Edita un usuario del propio tenant (nombre/apellido/avatar/email/rol/estado)."""
    if data.role == "super_admin":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No se puede asignar el rol super_admin desde el tenant")

    user_service = get_user_service()
    existing = await user_service.get_user_by_username(username)
    if not existing or existing.tenant_id != current_user.tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado")

    user = await user_service.update_user(
        username,
        role=data.role.value if data.role and hasattr(data.role, "value") else data.role,
        disabled=data.disabled,
        email=data.email,
        nombre=data.nombre,
        apellido=data.apellido,
        avatar_url=data.avatar_url,
    )
    return {"success": True, "user": _user_out(user).model_dump()}
