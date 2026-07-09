"""
Appointment models - modelos de request para la superficie HTTP de gestion.ar
sobre el microservicio externo devbout-appointments (ver app/integrations/appointments_client.py).

Estos modelos NO son los mismos que los schemas internos de devbout-appointments:
son el contrato que expone gestion.ar/backend a su propio frontend, más chico y
adaptado a lo que el panel de un bot necesita (sin exponer conceptos de tenant).
"""

from typing import Optional, List, Dict
from pydantic import BaseModel, Field


class AppointmentsConfigUpdate(BaseModel):
    """Actualización parcial de bot.metadata['appointments']"""
    resource_ids: Optional[List[str]] = None
    service_ids: Optional[List[str]] = None
    default_service_id: Optional[str] = None


class ResourceCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    category: Optional[str] = None
    capacity: int = Field(default=1, ge=1)
    timezone: Optional[str] = None
    metadata: Optional[Dict] = None


class ResourceUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    category: Optional[str] = None
    capacity: Optional[int] = Field(None, ge=1)
    timezone: Optional[str] = None
    metadata: Optional[Dict] = None
    is_active: Optional[bool] = None


class ServiceCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    duration_minutes: int = Field(..., gt=0)
    buffer_before_minutes: int = Field(default=0, ge=0)
    buffer_after_minutes: int = Field(default=0, ge=0)
    min_cancellation_notice_minutes: Optional[int] = Field(None, ge=0)
    metadata: Optional[Dict] = None


class ServiceUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    duration_minutes: Optional[int] = Field(None, gt=0)
    buffer_before_minutes: Optional[int] = Field(None, ge=0)
    buffer_after_minutes: Optional[int] = Field(None, ge=0)
    min_cancellation_notice_minutes: Optional[int] = Field(None, ge=0)
    metadata: Optional[Dict] = None
    is_active: Optional[bool] = None


class AttachResourceRequest(BaseModel):
    resource_id: str


class AvailabilityRuleCreateRequest(BaseModel):
    weekday: int = Field(..., ge=0, le=6)
    start_time: str
    end_time: str
    valid_from: Optional[str] = None
    valid_until: Optional[str] = None


class ManualAppointmentCreateRequest(BaseModel):
    """Alta manual desde el panel admin (ej. turno reservado por teléfono)."""
    resource_id: str
    service_id: Optional[str] = None
    start_at: str
    end_at: str
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    notes: Optional[str] = None


class AppointmentRescheduleRequest(BaseModel):
    start_at: str
    end_at: str


class AppointmentCancelRequest(BaseModel):
    reason: Optional[str] = None
