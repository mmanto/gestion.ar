"""
Plan models - Pydantic models para el catálogo de planes de suscripción
(ver estrategia de facturación, docs/dev/DECISIONS.md).
"""

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class PlanPeriodicity(str, Enum):
    MONTHLY = "monthly"
    ANNUAL = "annual"


class PlanCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    amount: float = Field(..., ge=0)
    periodicity: PlanPeriodicity


class PlanUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    amount: Optional[float] = Field(None, ge=0)
    periodicity: Optional[PlanPeriodicity] = None


class Plan(BaseModel):
    plan_id: str
    name: str
    description: Optional[str] = None
    amount: float
    periodicity: PlanPeriodicity
    created_at: str
    updated_at: str
