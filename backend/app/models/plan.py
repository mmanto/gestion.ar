"""
Plan models - Pydantic models para el catálogo de planes de suscripción
(ver estrategia de facturación, docs/dev/DECISIONS.md).
"""

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class PlanPeriodicity(str, Enum):
    MONTHLY = "monthly"
    ANNUAL = "annual"


class SubscriptionStatus(str, Enum):
    """Estado de la suscripción de un usuario.

    `pending`: el usuario pidió un plan al darse de alta (requested_plan_id)
    pero aún no fue aprobado. El pase a approved/active es manual
    (super_admin). Los usuarios que nunca eligieron plan nacen `active` sin
    requested_plan_id (ver ADR-013).
    """
    PENDING = "pending"
    APPROVED = "approved"
    ACTIVE = "active"


class UserPlanApproval(BaseModel):
    """Aprueba la solicitud de plan de un usuario (autoregistro/gmail).

    status approved|active marca el plan solicitado como aceptado; el plan
    del usuario es requested_plan_id (el que eligió al darse de alta).
    """
    status: SubscriptionStatus


class PlanCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    amount: float = Field(..., ge=0)
    periodicity: PlanPeriodicity
    # Módulos que este plan incluye por defecto (ver ADR-008,
    # docs/dev/DECISIONS.md) — BotModule.granted sigue funcionando como
    # override puntual por encima de esto.
    included_module_keys: List[str] = Field(default_factory=list)


class PlanUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    amount: Optional[float] = Field(None, ge=0)
    periodicity: Optional[PlanPeriodicity] = None
    # None = no tocar el set actual; una lista (incluso vacía) reemplaza el
    # set completo de módulos incluidos.
    included_module_keys: Optional[List[str]] = None


class Plan(BaseModel):
    plan_id: str
    name: str
    description: Optional[str] = None
    amount: float
    periodicity: PlanPeriodicity
    included_module_keys: List[str] = Field(default_factory=list)
    created_at: str
    updated_at: str
