"""
Partner Router - panel general del rol `partner` (`/api/partner/*`).

Superficie acotada a su tenant base y a los tenants derivados de él
(`tenants.parent_tenant_id`, ver ADR-041):

- alta de tenants derivados (clon del agente y de los módulos del base);
- datos, marca y estado de sus tenants (el base no se suspende ni se borra);
- prender/apagar módulos **ya otorgados** de sus agentes;
- usuarios (`admin`, `operativo`, `broker`) de sus tenants.

No expone nada de configuración técnica de agentes (system_prompt, ius_config,
flow, parámetros del modelo, canales, entrenamiento) ni otorgamiento de
módulos: eso sigue siendo de administración general (`/api/admin/*`).
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth_service import User
from app.dependencies.auth import get_current_user, require_role
from app.models.tenant import (
    ModuleEnableRequest,
    PartnerTenantCreate,
    PartnerTenantUpdate,
    TenantOwnUserCreate,
    TenantUserUpdate,
    UserRole,
)
from app.services.partner_service import get_partner_service
from app.services.user_service import get_user_service, to_tenant_user_out
from app.tenant_slug import TenantSlugConflict

router = APIRouter(
    prefix="/api/partner",
    tags=["partner"],
    dependencies=[Depends(require_role("partner"))],
)

#: Roles que el partner puede asignar. `partner` y `super_admin` los maneja
#: administración general desde /api/admin/users.
MANAGED_USER_ROLES = {UserRole.ADMIN, UserRole.OPERATIVO, UserRole.BROKER}

PARTNER_USER_MESSAGE = "El usuario partner lo administra administración general"


def _base(current_user: User) -> str:
    return get_partner_service().base_tenant_id(current_user)


async def _require_managed_tenant(base_tenant_id: str, tenant_id: str):
    tenant = await get_partner_service().get_managed_tenant(base_tenant_id, tenant_id)
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant no encontrado")
    return tenant


async def _require_managed_user(base_tenant_id: str, tenant_id: str, username: str):
    """Usuario de un tenant del alcance, editable por el partner."""
    await _require_managed_tenant(base_tenant_id, tenant_id)
    existing = await get_user_service().get_user_by_username(username)
    if not existing or existing.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado")
    if existing.role == UserRole.PARTNER.value:
        raise HTTPException(status.HTTP_403_FORBIDDEN, PARTNER_USER_MESSAGE)
    return existing


# ── Tenants ──────────────────────────────────────────────────────────────────

@router.get("/tenants", response_model=dict)
async def list_tenants(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    """Tenant base + derivados (el base se incluye: el partner gestiona su
    agente y sus módulos)."""
    skip = (page - 1) * limit
    return {"success": True, **await get_partner_service().list_tenants(_base(current_user), skip, limit)}


@router.post("/tenants", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_tenant(data: PartnerTenantCreate, current_user: User = Depends(get_current_user)):
    """Alta de un tenant derivado: clona el agente y los módulos del base."""
    try:
        tenant = await get_partner_service().provision_tenant(_base(current_user), data)
    except PermissionError as e:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(e))
    except ValueError as e:
        # `TenantSlugConflict` hereda de ValueError: el alta ya responde 409.
        raise HTTPException(status.HTTP_409_CONFLICT, str(e))
    except LookupError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant base no encontrado")
    return {"success": True, "tenant": tenant.model_dump()}


@router.get("/tenants/{tenant_id}", response_model=dict)
async def get_tenant(tenant_id: str, current_user: User = Depends(get_current_user)):
    tenant = await _require_managed_tenant(_base(current_user), tenant_id)
    return {"success": True, "tenant": tenant.model_dump()}


@router.patch("/tenants/{tenant_id}", response_model=dict)
async def update_tenant(
    tenant_id: str,
    data: PartnerTenantUpdate,
    current_user: User = Depends(get_current_user),
):
    try:
        tenant = await get_partner_service().update_managed_tenant(_base(current_user), tenant_id, data)
    except LookupError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant no encontrado")
    except TenantSlugConflict as e:
        # Un nombre interno ya usado es conflicto, no un pedido inválido.
        raise HTTPException(status.HTTP_409_CONFLICT, str(e))
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant no encontrado")
    return {"success": True, "tenant": tenant.model_dump()}


@router.delete("/tenants/{tenant_id}", response_model=dict)
async def delete_tenant(tenant_id: str, current_user: User = Depends(get_current_user)):
    try:
        deleted = await get_partner_service().delete_managed_child(_base(current_user), tenant_id)
    except LookupError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant no encontrado")
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    if not deleted:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "No se puede eliminar: el tenant tiene agentes, usuarios o datos asociados. "
            "Eliminá primero sus usuarios y agentes.",
        )
    return {"success": True, "message": "Tenant eliminado"}


# ── Agentes y módulos de un tenant del alcance ───────────────────────────────

@router.get("/tenants/{tenant_id}/bots", response_model=dict)
async def list_bots(
    tenant_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    """Resumen read-only de los agentes (el partner no los crea ni edita)."""
    skip = (page - 1) * limit
    try:
        result = await get_partner_service().list_bots(_base(current_user), tenant_id, skip, limit)
    except LookupError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant no encontrado")
    return {
        "success": True,
        "bots": [
            {
                "bot_id": b.bot_id,
                "name": b.name,
                "description": b.description,
                "status": b.status,
                "business_type": b.business_type,
            }
            for b in result["bots"]
        ],
        "total": result["total"],
        "page": result["page"],
        "pages": result["pages"],
        "limit": result["limit"],
    }


@router.get("/tenants/{tenant_id}/bots/{bot_id}/modules", response_model=dict)
async def get_bot_modules(
    tenant_id: str,
    bot_id: str,
    current_user: User = Depends(get_current_user),
):
    try:
        modules = await get_partner_service().get_bot_modules(_base(current_user), tenant_id, bot_id)
    except LookupError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agente no encontrado")
    return {"success": True, "modules": [m.model_dump() for m in modules]}


@router.patch("/tenants/{tenant_id}/bots/{bot_id}/modules/{module_key}", response_model=dict)
async def set_bot_module_enabled(
    tenant_id: str,
    bot_id: str,
    module_key: str,
    body: ModuleEnableRequest,
    current_user: User = Depends(get_current_user),
):
    """Prende/apaga un módulo ya otorgado por administración general."""
    try:
        module = await get_partner_service().set_bot_module_enabled(
            _base(current_user), tenant_id, bot_id, module_key, body.enabled
        )
    except LookupError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agente no encontrado")
    except (PermissionError, ValueError) as e:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(e))
    return {"success": True, "module": module.model_dump()}


# ── Usuarios de un tenant del alcance ────────────────────────────────────────

@router.get("/tenants/{tenant_id}/users", response_model=dict)
async def list_users(
    tenant_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
):
    await _require_managed_tenant(_base(current_user), tenant_id)
    skip = (page - 1) * limit
    result = await get_user_service().list_users(tenant_id=tenant_id, skip=skip, limit=limit)
    return {
        "success": True,
        "users": [to_tenant_user_out(u).model_dump() for u in result["users"]],
        "total": result["total"],
        "page": result["page"],
        "pages": result["pages"],
        "limit": result["limit"],
    }


@router.post("/tenants/{tenant_id}/users", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_user(
    tenant_id: str,
    data: TenantOwnUserCreate,
    current_user: User = Depends(get_current_user),
):
    await _require_managed_tenant(_base(current_user), tenant_id)
    if data.role not in MANAGED_USER_ROLES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "El partner sólo puede crear usuarios con rol admin, operativo o broker",
        )

    try:
        user = await get_user_service().create_user(
            username=data.username,
            password=data.password,
            email=data.email,
            nombre=data.nombre,
            apellido=data.apellido,
            avatar_url=data.avatar_url,
            tenant_id=tenant_id,
            role=data.role.value,
            broker_username=data.broker_username,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return {"success": True, "user": to_tenant_user_out(user).model_dump()}


@router.patch("/tenants/{tenant_id}/users/{username}", response_model=dict)
async def update_user(
    tenant_id: str,
    username: str,
    data: TenantUserUpdate,
    current_user: User = Depends(get_current_user),
):
    await _require_managed_user(_base(current_user), tenant_id, username)
    if data.role is not None and data.role not in MANAGED_USER_ROLES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "El partner no puede asignar el rol partner ni super_admin",
        )

    user_service = get_user_service()
    user = await user_service.update_user(
        username,
        role=data.role.value if data.role else None,
        disabled=data.disabled,
        email=data.email,
        nombre=data.nombre,
        apellido=data.apellido,
        avatar_url=data.avatar_url,
        broker_username=data.broker_username,
        clear_broker=data.clear_broker,
        password=data.password,
    )
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado")

    # Igual que el admin del tenant: el estado de la suscripción del plan es
    # parte de administrar al usuario (aprobar un pendiente, corregirlo).
    if data.subscription_status is not None:
        user = await user_service.approve_plan_request(username, data.subscription_status.value)

    return {"success": True, "user": to_tenant_user_out(user).model_dump()}


@router.delete("/tenants/{tenant_id}/users/{username}", response_model=dict)
async def delete_user(
    tenant_id: str,
    username: str,
    current_user: User = Depends(get_current_user),
):
    await _require_managed_user(_base(current_user), tenant_id, username)
    deleted = await get_user_service().delete_user(username)
    if not deleted:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "No se pudo eliminar el usuario: tiene agentes u otros recursos asociados.",
        )
    return {"success": True, "message": "Usuario eliminado"}
