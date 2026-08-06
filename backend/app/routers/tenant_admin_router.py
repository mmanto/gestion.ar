"""
Tenant Admin Router - Administración general de la plataforma (super_admin).

Alta/baja/modificación de tenants y usuarios (UsuarioAdmin/Usuario), y
otorgamiento de módulos a bots. Ver estrategia multi-tenant en
docs/dev/DECISIONS.md.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth_service import User, get_password_hash
from app.dependencies.auth import get_current_user, require_role
from app.models.plan import PlanCreate, PlanUpdate, UserPlanApproval
from app.models.tenant import (
    ModuleOut,
    Tenant,
    TenantCreate,
    TenantUpdate,
    TenantUserCreate,
    TenantUserOut,
    TenantUserUpdate,
)
from app.services.bot_service import get_bot_service
from app.services.module_service import get_module_service
from app.services.plan_service import get_plan_service
from app.services.tenant_service import get_tenant_service
from app.services.user_service import get_user_service

router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(require_role("super_admin"))],
)


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
        requested_plan_id=getattr(user_in_db, "requested_plan_id", None),
        subscription_status=getattr(user_in_db, "subscription_status", "active"),
        broker_username=user_in_db.broker_username,
    )


# ── Planes ───────────────────────────────────────────────────────────────────

@router.post("/plans", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_plan(data: PlanCreate):
    try:
        plan = await get_plan_service().create_plan(data)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return {"success": True, "plan": plan.model_dump()}


@router.get("/plans", response_model=dict)
async def list_plans():
    plans = await get_plan_service().list_plans()
    return {"success": True, "plans": [p.model_dump() for p in plans]}


@router.get("/plans/{plan_id}", response_model=dict)
async def get_plan(plan_id: str):
    plan = await get_plan_service().get_plan(plan_id)
    if not plan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan no encontrado")
    return {"success": True, "plan": plan.model_dump()}


@router.patch("/plans/{plan_id}", response_model=dict)
async def update_plan(plan_id: str, data: PlanUpdate):
    try:
        plan = await get_plan_service().update_plan(plan_id, data)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    if not plan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan no encontrado")
    return {"success": True, "plan": plan.model_dump()}


@router.delete("/plans/{plan_id}", response_model=dict)
async def delete_plan(plan_id: str):
    deleted = await get_plan_service().delete_plan(plan_id)
    if not deleted:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "No se pudo eliminar: el plan no existe o tiene tenants suscriptos",
        )
    return {"success": True, "message": "Plan eliminado"}


# ── Tenants ──────────────────────────────────────────────────────────────────

@router.post("/tenants", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_tenant(data: TenantCreate):
    tenant = await get_tenant_service().create_tenant(data)
    return {"success": True, "tenant": tenant.model_dump()}


@router.get("/tenants", response_model=dict)
async def list_tenants(page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=100)):
    skip = (page - 1) * limit
    result = await get_tenant_service().list_tenants(skip=skip, limit=limit)
    return {
        "success": True,
        "tenants": [t.model_dump() for t in result["tenants"]],
        "total": result["total"],
        "page": result["page"],
        "pages": result["pages"],
        "limit": result["limit"],
    }


@router.get("/tenants/{tenant_id}", response_model=dict)
async def get_tenant(tenant_id: str):
    tenant = await get_tenant_service().get_tenant(tenant_id)
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant no encontrado")
    return {"success": True, "tenant": tenant.model_dump()}


@router.patch("/tenants/{tenant_id}", response_model=dict)
async def update_tenant(tenant_id: str, data: TenantUpdate):
    tenant = await get_tenant_service().update_tenant(tenant_id, data)
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant no encontrado")
    return {"success": True, "tenant": tenant.model_dump()}


@router.patch("/users/{username}/plan-request", response_model=dict)
async def approve_user_plan_request(username: str, data: UserPlanApproval):
    """Aprueba (manual) el plan que el usuario pidió al darse de alta.

    Pasa subscription_status de 'pending' a approved|active. El plan del
    usuario es requested_plan_id (el que eligió al registrarse). Ver ADR-013.
    """
    try:
        user = await get_user_service().approve_plan_request(username, data.status.value)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from e
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado")
    return {"success": True, "user": _user_out(user).model_dump()}


# ── Usuarios (UsuarioAdmin / Usuario) de cualquier tenant ───────────────────

@router.post("/users", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_tenant_user(data: TenantUserCreate):
    tenant = await get_tenant_service().get_tenant(data.tenant_id)
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant no encontrado")

    if data.role == "super_admin":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "No se puede crear un super_admin con tenant asociado",
        )

    user_service = get_user_service()
    try:
        user = await user_service.create_user(
            username=data.username,
            password=data.password,
            email=data.email,
            nombre=data.nombre,
            apellido=data.apellido,
            avatar_url=data.avatar_url,
            tenant_id=data.tenant_id,
            role=data.role.value if hasattr(data.role, "value") else data.role,
            broker_username=data.broker_username,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

    return {"success": True, "user": _user_out(user).model_dump()}


@router.get("/users", response_model=dict)
async def list_tenant_users(
    tenant_id: str = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    skip = (page - 1) * limit
    result = await get_user_service().list_users(tenant_id=tenant_id, skip=skip, limit=limit)
    return {
        "success": True,
        "users": [_user_out(u).model_dump() for u in result["users"]],
        "total": result["total"],
        "page": result["page"],
        "pages": result["pages"],
        "limit": result["limit"],
    }


@router.patch("/users/{username}", response_model=dict)
async def update_tenant_user(username: str, data: TenantUserUpdate):
    if data.role == "super_admin":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Usá /api/admin/users para crear un super_admin directamente, sin tenant",
        )

    user = await get_user_service().update_user(
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
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado")
    return {"success": True, "user": _user_out(user).model_dump()}


@router.delete("/users/{username}", response_model=dict)
async def delete_tenant_user(username: str):
    deleted = await get_user_service().delete_user(username)
    if not deleted:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "No se pudo eliminar: el usuario no existe o tiene bots asociados",
        )
    return {"success": True, "message": "Usuario eliminado"}


# ── Módulos ──────────────────────────────────────────────────────────────────

@router.get("/modules", response_model=dict)
async def list_modules():
    modules = await get_module_service().list_modules()
    return {"success": True, "modules": [m.model_dump() for m in modules]}


@router.get("/bots/{bot_id}/modules", response_model=dict)
async def get_bot_modules(bot_id: str):
    bot = await get_bot_service().get_bot(bot_id)
    if not bot:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bot no encontrado")
    items = await get_module_service().get_bot_modules(bot_id)
    return {"success": True, "modules": [m.model_dump() for m in items]}


@router.post("/bots/{bot_id}/modules/{module_key}/grant", response_model=dict)
async def grant_module(bot_id: str, module_key: str, current_user: User = Depends(get_current_user)):
    bot = await get_bot_service().get_bot(bot_id)
    if not bot:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bot no encontrado")

    result = await get_module_service().grant_module(bot_id, module_key, granted_by=current_user.username)
    return {"success": True, "module": result.model_dump()}


@router.delete("/bots/{bot_id}/modules/{module_key}/grant", response_model=dict)
async def revoke_module(bot_id: str, module_key: str):
    revoked = await get_module_service().revoke_module(bot_id, module_key)
    if not revoked:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "El módulo no estaba otorgado a este bot")
    return {"success": True, "message": "Módulo revocado"}
