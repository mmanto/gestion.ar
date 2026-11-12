"""
Tenant models - Pydantic models para Tenant, usuarios de administración
general y el catálogo de módulos (ver estrategia multi-tenant).
"""

from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.tenant_slug import validate_tenant_slug


class TenantStatus(str, Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    TRIAL = "trial"


class UserRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    OPERATIVO = "operativo"
    BROKER = "broker"
    #: Responsable de un tenant base: construye y administra tenants derivados
    #: desde el panel general (ver ADR-041).
    PARTNER = "partner"


class TenantSlugInput(BaseModel):
    """Normaliza `slug` en los schemas de alta y edición.

    Vacío/blanco → `None` (el backend autogenera el nombre interno del nombre
    del tenant); si viene, se valida con `validate_tenant_slug` y un valor
    inválido sale como 422 de FastAPI.
    """

    @field_validator("slug", mode="before", check_fields=False)
    @classmethod
    def _clean_slug(cls, value: Any) -> Optional[str]:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return None
            return validate_tenant_slug(stripped)
        return value


class TenantCreate(TenantSlugInput):
    name: str = Field(..., min_length=2, max_length=100)
    domain: Optional[str] = Field(None, description="Dominio propio del tenant, ej. ius.com.mx")
    #: Nombre interno de la URL del apex (`intellify.pro/<slug>`). Si se omite
    #: se autogenera del nombre (con sufijo `-2`, `-3`… si está tomado).
    slug: Optional[str] = None
    status: TenantStatus = TenantStatus.ACTIVE
    branding: Dict[str, Any] = Field(default_factory=dict)
    plan_id: str = Field(..., description="Plan de suscripción al que queda dado de alta el tenant")


class TenantUpdate(TenantSlugInput):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    domain: Optional[str] = None
    #: Cambiarlo cambia la URL interna; la anterior deja de resolver (no hay
    #: redirect ni historial de slugs).
    slug: Optional[str] = None
    status: Optional[TenantStatus] = None
    branding: Optional[Dict[str, Any]] = None
    plan_id: Optional[str] = None


class PartnerTenantCreate(TenantSlugInput):
    """Alta de un tenant derivado: el plan, estado, settings y marca base
    salen del tenant base; sólo se eligen nombre y dominio."""
    name: str = Field(..., min_length=2, max_length=100)
    domain: Optional[str] = None
    slug: Optional[str] = None
    branding: Dict[str, Any] = Field(default_factory=dict)


class PartnerTenantUpdate(TenantSlugInput):
    """Edición permitida al partner. `status` sólo aplica a tenants derivados."""
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    domain: Optional[str] = None
    slug: Optional[str] = None
    status: Optional[TenantStatus] = None
    branding: Optional[Dict[str, Any]] = None


class Tenant(BaseModel):
    tenant_id: str
    name: str
    domain: Optional[str] = None
    #: Nombre interno (`intellify.pro/<slug>`); `None` en tenants creados por
    #: los scripts históricos.
    slug: Optional[str] = None
    status: TenantStatus
    branding: Dict[str, Any] = Field(default_factory=dict)
    settings: Dict[str, Any] = Field(default_factory=dict)
    plan_id: str
    #: Tenant base del que se derivó este tenant (NULL = tenant raíz).
    parent_tenant_id: Optional[str] = None
    created_at: str
    updated_at: str

    @property
    def free_signup(self) -> bool:
        """¿El alta de usuarios de este tenant es gratuita?

        Flag en `settings` (`{"free_signup": true}`): el alta no pide plan ni
        manda a pagar y la cuenta queda vigente sin plan solicitado (p. ej.
        pachoteayuda, que no vende suscripciones por usuario como ius)."""
        return bool(self.settings.get("free_signup"))


class TenantPublicInfo(BaseModel):
    """Info pública de un tenant (sin PII) — para landing/login del frontend-tenant."""
    tenant_id: str
    name: str
    #: Nombre interno con el que la SPA resuelve el tenant desde el path.
    slug: Optional[str] = None
    status: TenantStatus
    branding: Dict[str, Any] = Field(default_factory=dict)
    settings: Dict[str, Any] = Field(default_factory=dict)


#: Proveedores de IA que puede elegir un tenant (ADR-038). Ollama no está:
#: es una opción global de plataforma porque no tiene API key.
LLMProvider = Literal["claude", "deepseek", "openrouter"]


class TenantLLMConfigUpdate(BaseModel):
    """Alta/edición de la config de IA del tenant. `api_key` puede omitirse al
    editar si se mantiene el mismo proveedor: en ese caso se reusa la key
    guardada (ver tenant_llm_service.save_tenant_llm_config)."""

    provider: LLMProvider
    model: str = Field(..., min_length=3, max_length=200)
    api_key: Optional[str] = Field(None, min_length=8, max_length=512)


class TenantLLMConfigOut(BaseModel):
    """Config de IA visible desde el backoffice — nunca incluye la key usable,
    sólo el hint de los últimos 4 caracteres."""

    configured: bool
    provider: Optional[LLMProvider] = None
    model: Optional[str] = None
    api_key_hint: Optional[str] = None
    last_validated_at: Optional[str] = None
    last_error: Optional[str] = None
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None


class TenantUserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)
    email: Optional[str] = None
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    avatar_url: Optional[str] = None
    #: Tenant del usuario. Obligatorio salvo `role=super_admin`, el único rol
    #: que vive sin tenant (ver ck_users_role_tenant_consistency).
    tenant_id: Optional[str] = None
    role: UserRole = UserRole.OPERATIVO
    broker_username: Optional[str] = Field(None, description="Solo para role=operativo: el broker (firma) del que depende")

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
    broker_username: Optional[str] = Field(None, description="Solo para role=operativo: el broker (firma) del que depende")

    class Config:
        use_enum_values = False


from app.models.plan import SubscriptionStatus


class TenantUserUpdate(BaseModel):
    role: Optional[UserRole] = None
    disabled: Optional[bool] = None
    email: Optional[str] = None
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    avatar_url: Optional[str] = None
    #: Nueva contraseña en texto plano (se hashea en user_service.update_user).
    #: Omitirla deja la actual intacta.
    password: Optional[str] = Field(None, min_length=6, max_length=128)
    # Estado de la suscripción del plan asociado al usuario. El admin del
    # tenant puede aprobar un plan pendiente (pending -> approved/active).
    subscription_status: Optional[SubscriptionStatus] = None
    broker_username: Optional[str] = Field(None, description="Solo para role=operativo: el broker (firma) del que depende")
    clear_broker: bool = Field(False, description="True para desasociar al operativo de su broker actual")


class TenantUserOut(BaseModel):
    username: str
    email: Optional[str] = None
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    avatar_url: Optional[str] = None
    tenant_id: Optional[str] = None
    role: str
    disabled: bool
    requested_plan_id: Optional[str] = None
    subscription_status: str = "active"
    broker_username: Optional[str] = None


class ModuleOut(BaseModel):
    module_key: str
    name: str
    description: Optional[str] = None


class BotModuleOut(BaseModel):
    bot_id: str
    module_key: str
    granted: bool
    enabled: bool
    # Distinto de `granted`: True si el módulo puede habilitarse (otorgado
    # O incluido en el plan del tenant, ver ADR-008), aunque no exista
    # todavía una fila BotModule para este bot. La UI de autoservicio debe
    # usar esto, no `granted`, para decidir si el toggle es accionable.
    available: bool = False
    module_name: Optional[str] = None
    module_description: Optional[str] = None


class TenantModuleOut(BaseModel):
    tenant_id: str
    module_key: str
    granted: bool
    enabled: bool
    # Distinto de `granted`: True si el módulo puede habilitarse (otorgado
    # al tenant O incluido en su plan, ver ADR-008), aunque no exista
    # todavía una fila TenantModule. Mismo criterio que BotModuleOut.available.
    available: bool = False
    module_name: Optional[str] = None
    module_description: Optional[str] = None


class ModuleEnableRequest(BaseModel):
    enabled: bool


class CustomFactsUpdate(BaseModel):
    custom_facts: Dict[str, str]


class AutoQualifyColorsUpdate(BaseModel):
    colors: List[Literal["verde", "amarillo", "rojo"]] = Field(default_factory=list)
