"""
Tenant models - Pydantic models para Tenant, usuarios de administración
general y el catálogo de módulos (ver estrategia multi-tenant).
"""

from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class TenantStatus(str, Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    TRIAL = "trial"


class UserRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    OPERATIVO = "operativo"


class TenantCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    domain: Optional[str] = Field(None, description="Dominio propio del tenant, ej. ius.com.mx")
    status: TenantStatus = TenantStatus.ACTIVE
    branding: Dict[str, Any] = Field(default_factory=dict)
    plan_id: str = Field(..., description="Plan de suscripción al que queda dado de alta el tenant")


class TenantUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    domain: Optional[str] = None
    status: Optional[TenantStatus] = None
    branding: Optional[Dict[str, Any]] = None
    plan_id: Optional[str] = None


class Tenant(BaseModel):
    tenant_id: str
    name: str
    domain: Optional[str] = None
    status: TenantStatus
    branding: Dict[str, Any] = Field(default_factory=dict)
    plan_id: str
    created_at: str
    updated_at: str


class TenantPublicInfo(BaseModel):
    """Info pública de un tenant (sin PII) — para landing/login del frontend-tenant."""
    tenant_id: str
    name: str
    status: TenantStatus
    branding: Dict[str, Any] = Field(default_factory=dict)


class TenantUserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)
    email: Optional[str] = None
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    avatar_url: Optional[str] = None
    tenant_id: str
    role: UserRole = UserRole.OPERATIVO

    class Config:
        use_enum_values = False


class TenantOwnUserCreate(BaseModel):
    """Alta de usuario desde el propio tenant (self-service) — sin tenant_id:
    el backend lo fuerza al del usuario autenticado (ver tenant_router.py)."""
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)
    email: Optional[str] = None
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    avatar_url: Optional[str] = None
    role: UserRole = UserRole.OPERATIVO

    class Config:
        use_enum_values = False


class TenantUserUpdate(BaseModel):
    role: Optional[UserRole] = None
    disabled: Optional[bool] = None
    email: Optional[str] = None
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    avatar_url: Optional[str] = None


class TenantUserOut(BaseModel):
    username: str
    email: Optional[str] = None
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    avatar_url: Optional[str] = None
    tenant_id: Optional[str] = None
    role: str
    disabled: bool


class ModuleOut(BaseModel):
    module_key: str
    name: str
    description: Optional[str] = None


class BotModuleOut(BaseModel):
    bot_id: str
    module_key: str
    granted: bool
    enabled: bool
    module_name: Optional[str] = None
    module_description: Optional[str] = None


class ModuleEnableRequest(BaseModel):
    enabled: bool


class CustomFactsUpdate(BaseModel):
    custom_facts: Dict[str, str]


class AutoQualifyColorsUpdate(BaseModel):
    colors: List[Literal["verde", "amarillo", "rojo"]] = Field(default_factory=list)
