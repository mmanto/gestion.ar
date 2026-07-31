"""
Tenant Appointments Router - turnos scoped al tenant logueado (Usuario/
UsuarioAdmin), para el calendario propio del bot en frontend-tenant.

appointments_router.py (el CRUD completo de turnos/resources/services) sólo
acepta `require_role("super_admin")` -- lo usa administración general, no el
panel del propio tenant. Este router expone el subconjunto que un admin de
tenant necesita para el calendario del Escritorio (listar/crear/reprogramar/
cancelar/confirmar turnos), resolviendo el bot desde `current_user.tenant_id`
en vez de tomar un `bot_id` arbitrario del path -- así un admin de un tenant
no puede pedir turnos de otro tenant con solo cambiar un id en la URL.

Reusa los helpers de ownership/errores de appointments_router.py (mismo
microservicio externo devbout-appointments, ver su docstring) en vez de
duplicarlos.

Asume un bot por tenant (mismo supuesto que /tenant/bots?limit=1 en
tenant_router.py) -- no hay selección de bot en el frontend-tenant hoy.

Orden de las rutas: las estáticas (/resources, /services, /slots) van ANTES
que las genéricas /{appointment_id} -- mismo motivo que en
appointments_router.py, para que FastAPI no interprete "resources" como un
appointment_id.
"""

import asyncio
import uuid
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth_service import User
from app.dependencies.auth import get_current_user
from app.integrations.appointments_client import SlotUnavailableError, get_appointments_client
from app.models.appointment import (
    AppointmentCancelRequest,
    AppointmentRescheduleRequest,
    ManualAppointmentCreateRequest,
)
from app.models.bot import Bot
from app.routers.appointments_router import (
    _get_appointments_config,
    _raise_upstream_error,
    _verify_appointment_ownership,
    _verify_resource_ownership,
    _verify_service_ownership,
)
from app.services.bot_service import get_bot_service
from app.services.client_service import get_client_service
from app.services.module_service import get_module_service

router = APIRouter(prefix="/api/tenant/appointments", tags=["tenant-appointments"])


async def _get_my_bot(current_user: User = Depends(get_current_user)) -> Bot:
    result = await get_bot_service().get_bots_by_tenant(tenant_id=current_user.tenant_id, skip=0, limit=1)
    bots = result["bots"]
    if not bots:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No hay un bot configurado para este tenant")
    bot = bots[0]
    if not await get_module_service().is_available(bot.bot_id, "appointments"):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "El módulo 'appointments' no está disponible para este bot"
        )
    return bot


# ── Datos de apoyo para el formulario de alta manual (van primero, ver
# docstring del módulo) ─────────────────────────────────────────────────


@router.get("/resources")
async def list_my_resources(bot: Bot = Depends(_get_my_bot)):
    config = _get_appointments_config(bot)
    client = get_appointments_client()

    async def _safe_get(resource_id: str) -> Optional[dict]:
        try:
            return await client.get_resource(resource_id)
        except httpx.HTTPStatusError:
            return None

    resources = await asyncio.gather(*[_safe_get(rid) for rid in config["resource_ids"]])
    return {"success": True, "items": [r for r in resources if r is not None]}


@router.get("/services")
async def list_my_services(bot: Bot = Depends(_get_my_bot)):
    config = _get_appointments_config(bot)
    client = get_appointments_client()

    async def _safe_get(service_id: str) -> Optional[dict]:
        try:
            return await client.get_service(service_id)
        except httpx.HTTPStatusError:
            return None

    services = await asyncio.gather(*[_safe_get(sid) for sid in config["service_ids"]])
    return {"success": True, "items": [s for s in services if s is not None]}


@router.get("/slots")
async def list_my_slots(
    resource_id: str = Query(...),
    date_from: str = Query(...),
    date_to: str = Query(...),
    service_id: Optional[str] = Query(None),
    bot: Bot = Depends(_get_my_bot),
):
    _verify_resource_ownership(bot, resource_id)
    try:
        slots = await get_appointments_client().list_slots(resource_id, date_from, date_to, service_id=service_id)
    except httpx.HTTPStatusError as exc:
        _raise_upstream_error(exc)
    return {"success": True, "items": slots}


# ── Turnos ───────────────────────────────────────────────────────────────


@router.get("")
async def list_my_appointments(
    status_filter: Optional[str] = Query(None, alias="status"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=200),
    bot: Bot = Depends(_get_my_bot),
):
    config = _get_appointments_config(bot)
    client = get_appointments_client()

    async def _fetch(resource_id: str) -> list[dict]:
        result = await client.list_appointments(
            resource_id=resource_id, status=status_filter, date_from=date_from, date_to=date_to, page_size=100
        )
        return result["items"]

    results = await asyncio.gather(*[_fetch(rid) for rid in config["resource_ids"]])
    merged = [item for items in results for item in items]
    merged.sort(key=lambda a: a["start_at"])

    total = len(merged)
    start = (page - 1) * page_size
    page_items = merged[start : start + page_size]

    return {
        "success": True,
        "items": page_items,
        "total": total,
        "page": page,
        "pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
        "limit": page_size,
    }


@router.post("", status_code=201)
async def create_my_appointment(
    payload: ManualAppointmentCreateRequest,
    bot: Bot = Depends(_get_my_bot),
):
    _verify_resource_ownership(bot, payload.resource_id)
    if payload.service_id:
        _verify_service_ownership(bot, payload.service_id)

    client_id: Optional[str] = None
    if payload.customer_phone:
        client_record = await get_client_service().get_or_create_client(
            bot_id=bot.bot_id,
            external_id=payload.customer_phone,
            source="manual",
            metadata={"name": payload.customer_name} if payload.customer_name else None,
        )
        client_id = client_record.client_id

    customer_ref = client_id or f"manual-{uuid.uuid4()}"

    try:
        appointment = await get_appointments_client().create_appointment(
            resource_id=payload.resource_id,
            start_at=payload.start_at,
            end_at=payload.end_at,
            customer_ref=customer_ref,
            service_id=payload.service_id,
            metadata={
                "bot_id": bot.bot_id,
                "client_id": client_id,
                "customer_name": payload.customer_name,
                "customer_phone": payload.customer_phone,
                "notes": payload.notes,
                "source": "manual",
            },
        )
    except SlotUnavailableError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        _raise_upstream_error(exc)

    return {"success": True, "appointment": appointment}


@router.get("/{appointment_id}")
async def get_my_appointment(appointment_id: str, bot: Bot = Depends(_get_my_bot)):
    appointment = await _verify_appointment_ownership(bot, appointment_id, get_appointments_client())
    return {"success": True, "appointment": appointment}


@router.patch("/{appointment_id}")
async def reschedule_my_appointment(
    appointment_id: str, payload: AppointmentRescheduleRequest, bot: Bot = Depends(_get_my_bot)
):
    client = get_appointments_client()
    await _verify_appointment_ownership(bot, appointment_id, client)
    try:
        appointment = await client.reschedule_appointment(appointment_id, payload.start_at, payload.end_at)
    except SlotUnavailableError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        _raise_upstream_error(exc)
    return {"success": True, "appointment": appointment}


@router.post("/{appointment_id}/cancel")
async def cancel_my_appointment(
    appointment_id: str, payload: AppointmentCancelRequest, bot: Bot = Depends(_get_my_bot)
):
    client = get_appointments_client()
    await _verify_appointment_ownership(bot, appointment_id, client)
    try:
        appointment = await client.cancel_appointment(appointment_id, reason=payload.reason)
    except httpx.HTTPStatusError as exc:
        _raise_upstream_error(exc)
    return {"success": True, "appointment": appointment}


@router.post("/{appointment_id}/confirm")
async def confirm_my_appointment(appointment_id: str, bot: Bot = Depends(_get_my_bot)):
    client = get_appointments_client()
    await _verify_appointment_ownership(bot, appointment_id, client)
    try:
        appointment = await client.confirm_appointment(appointment_id)
    except httpx.HTTPStatusError as exc:
        _raise_upstream_error(exc)
    return {"success": True, "appointment": appointment}
