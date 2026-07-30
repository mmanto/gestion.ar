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

import os
import re
import uuid as _uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from app.auth_service import User
from app.dependencies.auth import get_current_user, require_role
from app.models.bot import BotStatus, BotUpdate
from app.models.tenant import AutoQualifyColorsUpdate, CustomFactsUpdate, ModuleEnableRequest, TenantOwnUserCreate, TenantUpdate, TenantUserOut, TenantUserUpdate
from app.models.channel import ChannelStatus
from app.services.bot_service import get_bot_service
from app.routers.upload_router import UPLOADS_DIR
from app.services.tenant_service import get_tenant_service
from app.services.module_service import get_module_service
from app.services.user_service import get_user_service
from app.services.channel_service import get_channel_service

router = APIRouter(prefix="/api/tenant", tags=["tenant"])


TENANT_LOGOS_DIR = os.path.join(UPLOADS_DIR, "tenants")
ALLOWED_LOGO_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
}
MAX_LOGO_BYTES = 2 * 1024 * 1024  # 2MB

# Temas visuales disponibles para el backoffice del tenant (ver
# frontend-tenant/src/types/template.types.ts TemplateId) — 'kero' es el
# default para tenants nuevos, 'default' queda solo por compatibilidad con
# tenants que ya lo tenían elegido.
VALID_TEMPLATE_IDS = {"default", "kero"}


# ── Branding ──────────────────────────────────────────────────────────────────

@router.post("/branding/logo", response_model=dict)
async def upload_tenant_logo(
    file: UploadFile = File(...),
    type: str = Query("horizontal", pattern="^(horizontal|vertical)$"),
    current_user: User = Depends(get_current_user),
):
    """Sube el logo del tenant y actualiza branding.logo_url_horizontal o
    branding.logo_url_vertical según el parámetro `type` (default: horizontal)."""
    ext = ALLOWED_LOGO_CONTENT_TYPES.get(file.content_type)
    if not ext:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Formato no soportado — usá JPG, PNG, WEBP o SVG",
        )

    contents = await file.read()
    if len(contents) > MAX_LOGO_BYTES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "La imagen supera el tamaño máximo de 2MB",
        )

    os.makedirs(TENANT_LOGOS_DIR, exist_ok=True)
    filename = f"{_uuid.uuid4().hex}{ext}"
    file_path = os.path.join(TENANT_LOGOS_DIR, filename)
    with open(file_path, "wb") as f:
        f.write(contents)

    url = f"/api/uploads/tenants/{filename}"
    field = "logo_url_horizontal" if type == "horizontal" else "logo_url_vertical"
    tenant_service = get_tenant_service()
    tenant = await tenant_service.get_tenant(current_user.tenant_id)
    branding = dict(tenant.branding) if tenant and tenant.branding else {}
    branding[field] = url
    await tenant_service.update_tenant(current_user.tenant_id, TenantUpdate(branding=branding))

    return {"success": True, "url": url, "type": type}


@router.patch("/branding", response_model=dict)
async def update_tenant_branding(
    body: dict,
    current_user: User = Depends(require_role("admin")),
):
    """Actualiza campos de branding (primary_color, tagline, template_id, sidebar_visible)."""
    primary_color = body.get("primary_color")
    tagline = body.get("tagline")
    template_id = body.get("template_id")
    sidebar_visible = body.get("sidebar_visible")

    if primary_color is not None:
        if not isinstance(primary_color, str) or not re.match(r"^#[0-9a-fA-F]{6}$", primary_color):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "primary_color debe ser un hex color válido (ej. #ff5722)",
            )

    if template_id is not None and template_id not in VALID_TEMPLATE_IDS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"template_id debe ser uno de: {', '.join(sorted(VALID_TEMPLATE_IDS))}",
        )

    if sidebar_visible is not None and not isinstance(sidebar_visible, bool):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "sidebar_visible debe ser un booleano",
        )

    tenant_service = get_tenant_service()
    tenant = await tenant_service.get_tenant(current_user.tenant_id)
    branding = dict(tenant.branding) if tenant and tenant.branding else {}

    if primary_color is not None:
        branding["primary_color"] = primary_color
    if template_id is not None:
        branding["template_id"] = template_id
    if sidebar_visible is not None:
        branding["sidebar_visible"] = sidebar_visible
    if tagline is not None:
        if not isinstance(tagline, str) or len(tagline) > 200:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "tagline debe ser un string de hasta 200 caracteres",
            )
        branding["tagline"] = tagline

    await tenant_service.update_tenant(current_user.tenant_id, TenantUpdate(branding=branding))

    return {"success": True, "branding": branding}

@router.delete("/branding/logo", response_model=dict)
async def delete_tenant_logo(
    type: str = Query("horizontal", pattern="^(horizontal|vertical)$"),
    current_user: User = Depends(require_role("admin")),
):
    """Elimina el logo del tenant (solo la referencia — no borra el archivo).
    `type` indica cuál eliminar: horizontal o vertical (default: horizontal)."""
    field = "logo_url_horizontal" if type == "horizontal" else "logo_url_vertical"
    tenant_service = get_tenant_service()
    tenant = await tenant_service.get_tenant(current_user.tenant_id)
    branding = dict(tenant.branding) if tenant and tenant.branding else {}
    branding[field] = None

    await tenant_service.update_tenant(current_user.tenant_id, TenantUpdate(branding=branding))

    return {"success": True}


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


@router.post("/bots/{bot_id}/my-channel", response_model=dict)
async def get_my_channel(bot_id: str, current_user: User = Depends(get_current_user)):
    """Autoservicio: obtiene (o crea) el canal web propio del usuario logueado
    para este bot — a lo sumo un canal por (bot, owner_username), ver
    uq_channels_bot_owner_web. Cualquier rol de tenant gestiona el suyo."""
    await _verify_tenant_bot(bot_id, current_user)

    channel_service = get_channel_service()
    channel = await channel_service.get_or_create_owner_web_channel(
        bot_id, current_user.username, f"Chat directo — {current_user.username}"
    )
    if channel.status != ChannelStatus.ACTIVE.value:
        await channel_service.activate_channel(channel.channel_id)
        channel = await channel_service.get_channel(channel.channel_id)

    return {"success": True, "channel": channel.model_dump()}


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
    """Colores del semáforo habilitados para calificación automática del Client
    (ver prospect_auto_qualify_service.py) — específico de bots tipo IUS."""
    bot = await _verify_tenant_bot(bot_id, current_user)
    return {"success": True, "auto_qualify_colors": bot.config.auto_qualify_colors}


@router.patch("/bots/{bot_id}/training/auto-qualify-colors", response_model=dict)
async def update_auto_qualify_colors(
    bot_id: str,
    body: AutoQualifyColorsUpdate,
    current_user: User = Depends(require_role("admin", "operativo")),
):
    """Edita los colores del semáforo para los que el agente califica el Client solo."""
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
        broker_username=user_in_db.broker_username,
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
            broker_username=data.broker_username,
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
        broker_username=data.broker_username,
        clear_broker=data.clear_broker,
    )
    return {"success": True, "user": _user_out(user).model_dump()}
