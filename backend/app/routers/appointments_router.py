"""
Appointments Router - API real de turnos, scoped por bot.

Reemplaza a appointments_demo_router.py (prueba de cableado). A diferencia de
ese router demo, este SÍ es utilizable en producción por el panel admin del
dueño del bot: CRUD de resources/services/availability-rules, listado y
gestión de turnos.

IMPORTANTE — aislamiento entre bots: devbout-appointments tiene UN SOLO tenant
("gestion-ar") compartido por TODOS los bots de gestion.ar (una sola API key,
sin noción de "bot" del lado del microservicio). Por eso cada bot guarda en
bot.metadata["appointments"] la lista de resource_ids/service_ids que le
pertenecen, y CADA endpoint de este router verifica ownership contra esa lista
antes de operar — si no, un bot podría ver/editar/cancelar recursos o turnos
de otro bot que comparte el mismo tenant.
"""

import asyncio
import uuid
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.dependencies.auth import require_role
from app.integrations.appointments_client import SlotUnavailableError, get_appointments_client
from app.models.appointment import (
    AppointmentCancelRequest,
    AppointmentRescheduleRequest,
    AppointmentsConfigUpdate,
    AttachResourceRequest,
    AvailabilityRuleCreateRequest,
    ManualAppointmentCreateRequest,
    ResourceCreateRequest,
    ResourceUpdateRequest,
    ServiceCreateRequest,
    ServiceUpdateRequest,
)
from app.models.bot import Bot, BotUpdate
from app.services.bot_service import get_bot_service
from app.services.client_service import get_client_service

router = APIRouter(
    prefix="/api/bots/{bot_id}/appointments",
    tags=["appointments"],
    dependencies=[Depends(require_role("super_admin"))],
)


async def verify_bot_access(bot_id: str) -> Bot:
    """Verificar que el bot exista (configuración técnica — sólo
    administración general llega hasta acá, ver dependency del router)."""
    bot = await get_bot_service().get_bot(bot_id)
    if not bot:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bot no encontrado")
    return bot


def _get_appointments_config(bot: Bot) -> dict:
    config = dict((bot.metadata or {}).get("appointments") or {})
    config.setdefault("resource_ids", [])
    config.setdefault("service_ids", [])
    config.setdefault("default_service_id", None)
    return config


async def _save_appointments_config(bot: Bot, config: dict) -> Bot:
    metadata = dict(bot.metadata or {})
    metadata["appointments"] = config
    updated = await get_bot_service().update_bot_admin(bot.bot_id, BotUpdate(metadata=metadata))
    if updated is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Error al guardar la configuración de turnos")
    return updated


def _verify_resource_ownership(bot: Bot, resource_id: str) -> None:
    config = _get_appointments_config(bot)
    if resource_id not in config["resource_ids"]:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recurso no encontrado")


def _verify_service_ownership(bot: Bot, service_id: str) -> None:
    config = _get_appointments_config(bot)
    if service_id not in config["service_ids"]:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Servicio no encontrado")


async def _verify_appointment_ownership(bot: Bot, appointment_id: str, client) -> dict:
    try:
        appointment = await client.get_appointment(appointment_id)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code in (401, 403):
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                "Error interno del servicio de turnos",
            ) from exc
        raise HTTPException(exc.response.status_code, "Turno no encontrado") from exc
    config = _get_appointments_config(bot)
    if str(appointment.get("resource_id")) not in config["resource_ids"]:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Turno no encontrado")
    return appointment


def _raise_upstream_error(exc: httpx.HTTPStatusError) -> None:
    detail = exc.response.text[:500] if exc.response.text else "Error interno del servicio de turnos"
    if exc.response.status_code in (401, 403):
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail,
        ) from exc
    raise HTTPException(exc.response.status_code, detail) from exc


# ── Config del bot (qué resources/services le pertenecen) ──────────────────


@router.get("/config")
async def get_appointments_config(bot: Bot = Depends(verify_bot_access)):
    return {"success": True, "config": _get_appointments_config(bot)}


@router.put("/config")
async def update_appointments_config(
    payload: AppointmentsConfigUpdate,
    bot: Bot = Depends(verify_bot_access),
):
    config = _get_appointments_config(bot)
    if payload.resource_ids is not None:
        config["resource_ids"] = payload.resource_ids
    if payload.service_ids is not None:
        config["service_ids"] = payload.service_ids
    if payload.default_service_id is not None:
        config["default_service_id"] = payload.default_service_id
    await _save_appointments_config(bot, config)
    return {"success": True, "config": config}


# ── Resources ────────────────────────────────────────────────────────────


@router.post("/resources", status_code=201)
async def create_resource(
    payload: ResourceCreateRequest,
    bot: Bot = Depends(verify_bot_access),
):
    client = get_appointments_client()
    try:
        resource = await client.create_resource(
            name=payload.name,
            category=payload.category,
            capacity=payload.capacity,
            timezone=payload.timezone,
            metadata=payload.metadata,
        )
    except httpx.HTTPStatusError as exc:
        _raise_upstream_error(exc)

    config = _get_appointments_config(bot)
    config["resource_ids"] = list({*config["resource_ids"], resource["id"]})
    await _save_appointments_config(bot, config)
    return {"success": True, "resource": resource}


@router.get("/resources")
async def list_resources(bot: Bot = Depends(verify_bot_access)):
    config = _get_appointments_config(bot)
    client = get_appointments_client()

    async def _safe_get(resource_id: str) -> Optional[dict]:
        try:
            return await client.get_resource(resource_id)
        except httpx.HTTPStatusError:
            return None

    resources = await asyncio.gather(*[_safe_get(rid) for rid in config["resource_ids"]])
    return {"success": True, "items": [r for r in resources if r is not None]}


@router.get("/resources/{resource_id}")
async def get_resource(resource_id: str, bot: Bot = Depends(verify_bot_access)):
    _verify_resource_ownership(bot, resource_id)
    try:
        resource = await get_appointments_client().get_resource(resource_id)
    except httpx.HTTPStatusError as exc:
        _raise_upstream_error(exc)
    return {"success": True, "resource": resource}


@router.patch("/resources/{resource_id}")
async def update_resource(resource_id: str, payload: ResourceUpdateRequest, bot: Bot = Depends(verify_bot_access)):
    _verify_resource_ownership(bot, resource_id)
    fields = payload.model_dump(exclude_unset=True)
    try:
        resource = await get_appointments_client().update_resource(resource_id, **fields)
    except httpx.HTTPStatusError as exc:
        _raise_upstream_error(exc)
    return {"success": True, "resource": resource}


@router.delete("/resources/{resource_id}", status_code=204)
async def deactivate_resource(resource_id: str, bot: Bot = Depends(verify_bot_access)):
    _verify_resource_ownership(bot, resource_id)
    try:
        await get_appointments_client().deactivate_resource(resource_id)
    except httpx.HTTPStatusError as exc:
        _raise_upstream_error(exc)


@router.post("/resources/{resource_id}/availability-rules", status_code=201)
async def create_availability_rule(
    resource_id: str, payload: AvailabilityRuleCreateRequest, bot: Bot = Depends(verify_bot_access)
):
    _verify_resource_ownership(bot, resource_id)
    try:
        rule = await get_appointments_client().create_availability_rule(
            resource_id,
            weekday=payload.weekday,
            start_time=payload.start_time,
            end_time=payload.end_time,
            valid_from=payload.valid_from,
            valid_until=payload.valid_until,
        )
    except httpx.HTTPStatusError as exc:
        _raise_upstream_error(exc)
    return {"success": True, "rule": rule}


@router.get("/resources/{resource_id}/availability-rules")
async def list_availability_rules(resource_id: str, bot: Bot = Depends(verify_bot_access)):
    _verify_resource_ownership(bot, resource_id)
    rules = await get_appointments_client().list_availability_rules(resource_id)
    return {"success": True, "items": rules}


@router.delete("/resources/{resource_id}/availability-rules/{rule_id}", status_code=204)
async def delete_availability_rule(resource_id: str, rule_id: str, bot: Bot = Depends(verify_bot_access)):
    _verify_resource_ownership(bot, resource_id)
    try:
        await get_appointments_client().delete_availability_rule(resource_id, rule_id)
    except httpx.HTTPStatusError as exc:
        _raise_upstream_error(exc)


# ── Services ─────────────────────────────────────────────────────────────


@router.post("/services", status_code=201)
async def create_service(
    payload: ServiceCreateRequest,
    bot: Bot = Depends(verify_bot_access),
):
    client = get_appointments_client()
    try:
        service = await client.create_service(
            name=payload.name,
            duration_minutes=payload.duration_minutes,
            buffer_before_minutes=payload.buffer_before_minutes,
            buffer_after_minutes=payload.buffer_after_minutes,
            min_cancellation_notice_minutes=payload.min_cancellation_notice_minutes,
            metadata=payload.metadata,
        )
    except httpx.HTTPStatusError as exc:
        _raise_upstream_error(exc)

    config = _get_appointments_config(bot)
    config["service_ids"] = list({*config["service_ids"], service["id"]})
    if not config["default_service_id"]:
        config["default_service_id"] = service["id"]
    await _save_appointments_config(bot, config)
    return {"success": True, "service": service}


@router.get("/services")
async def list_services(bot: Bot = Depends(verify_bot_access)):
    config = _get_appointments_config(bot)
    client = get_appointments_client()

    async def _safe_get(service_id: str) -> Optional[dict]:
        try:
            return await client.get_service(service_id)
        except httpx.HTTPStatusError:
            return None

    services = await asyncio.gather(*[_safe_get(sid) for sid in config["service_ids"]])
    return {"success": True, "items": [s for s in services if s is not None]}


@router.get("/services/{service_id}")
async def get_service(service_id: str, bot: Bot = Depends(verify_bot_access)):
    _verify_service_ownership(bot, service_id)
    try:
        service = await get_appointments_client().get_service(service_id)
    except httpx.HTTPStatusError as exc:
        _raise_upstream_error(exc)
    return {"success": True, "service": service}


@router.patch("/services/{service_id}")
async def update_service(service_id: str, payload: ServiceUpdateRequest, bot: Bot = Depends(verify_bot_access)):
    _verify_service_ownership(bot, service_id)
    fields = payload.model_dump(exclude_unset=True)
    try:
        service = await get_appointments_client().update_service(service_id, **fields)
    except httpx.HTTPStatusError as exc:
        _raise_upstream_error(exc)
    return {"success": True, "service": service}


@router.delete("/services/{service_id}", status_code=204)
async def deactivate_service(service_id: str, bot: Bot = Depends(verify_bot_access)):
    _verify_service_ownership(bot, service_id)
    try:
        await get_appointments_client().deactivate_service(service_id)
    except httpx.HTTPStatusError as exc:
        _raise_upstream_error(exc)


@router.post("/services/{service_id}/resources", status_code=204)
async def attach_resource_to_service(
    service_id: str, payload: AttachResourceRequest, bot: Bot = Depends(verify_bot_access)
):
    _verify_service_ownership(bot, service_id)
    _verify_resource_ownership(bot, payload.resource_id)
    try:
        await get_appointments_client().attach_resource_to_service(service_id, payload.resource_id)
    except httpx.HTTPStatusError as exc:
        _raise_upstream_error(exc)


@router.get("/services/{service_id}/resources")
async def list_service_resources(service_id: str, bot: Bot = Depends(verify_bot_access)):
    _verify_service_ownership(bot, service_id)
    resources = await get_appointments_client().list_service_resources(service_id)
    return {"success": True, "items": resources}


@router.delete("/services/{service_id}/resources/{resource_id}", status_code=204)
async def detach_resource_from_service(service_id: str, resource_id: str, bot: Bot = Depends(verify_bot_access)):
    _verify_service_ownership(bot, service_id)
    try:
        await get_appointments_client().detach_resource_from_service(service_id, resource_id)
    except httpx.HTTPStatusError as exc:
        _raise_upstream_error(exc)


# ── Slots ────────────────────────────────────────────────────────────────


@router.get("/slots")
async def get_slots(
    resource_id: str = Query(...),
    date_from: str = Query(...),
    date_to: str = Query(...),
    service_id: Optional[str] = Query(None),
    bot: Bot = Depends(verify_bot_access),
):
    _verify_resource_ownership(bot, resource_id)
    try:
        slots = await get_appointments_client().list_slots(resource_id, date_from, date_to, service_id=service_id)
    except httpx.HTTPStatusError as exc:
        _raise_upstream_error(exc)
    return {"success": True, "items": slots}


# ── Appointments (rutas genéricas, van AL FINAL para no shadowear las de arriba) ──


@router.get("")
async def list_bot_appointments(
    status_filter: Optional[str] = Query(None, alias="status"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    bot: Bot = Depends(verify_bot_access),
):
    config = _get_appointments_config(bot)
    client = get_appointments_client()

    # devbout-appointments solo filtra por UN resource_id a la vez; un bot puede
    # tener varios resources, así que pegamos una vez por cada uno y mergeamos
    # en Python. TODO: si algún resource individual supera 100 turnos en el
    # rango pedido, falta paginación remota (no relevante a la escala actual).
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
async def create_manual_appointment(
    payload: ManualAppointmentCreateRequest,
    bot: Bot = Depends(verify_bot_access),
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
async def get_appointment(appointment_id: str, bot: Bot = Depends(verify_bot_access)):
    appointment = await _verify_appointment_ownership(bot, appointment_id, get_appointments_client())
    return {"success": True, "appointment": appointment}


@router.patch("/{appointment_id}")
async def reschedule_appointment(
    appointment_id: str, payload: AppointmentRescheduleRequest, bot: Bot = Depends(verify_bot_access)
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
async def cancel_appointment(
    appointment_id: str, payload: AppointmentCancelRequest, bot: Bot = Depends(verify_bot_access)
):
    client = get_appointments_client()
    await _verify_appointment_ownership(bot, appointment_id, client)
    try:
        appointment = await client.cancel_appointment(appointment_id, reason=payload.reason)
    except httpx.HTTPStatusError as exc:
        _raise_upstream_error(exc)
    return {"success": True, "appointment": appointment}


@router.post("/{appointment_id}/confirm")
async def confirm_appointment(appointment_id: str, bot: Bot = Depends(verify_bot_access)):
    client = get_appointments_client()
    await _verify_appointment_ownership(bot, appointment_id, client)
    try:
        appointment = await client.confirm_appointment(appointment_id)
    except httpx.HTTPStatusError as exc:
        _raise_upstream_error(exc)
    return {"success": True, "appointment": appointment}


@router.post("/{appointment_id}/complete")
async def complete_appointment(appointment_id: str, bot: Bot = Depends(verify_bot_access)):
    client = get_appointments_client()
    await _verify_appointment_ownership(bot, appointment_id, client)
    try:
        appointment = await client.complete_appointment(appointment_id)
    except httpx.HTTPStatusError as exc:
        _raise_upstream_error(exc)
    return {"success": True, "appointment": appointment}


@router.post("/{appointment_id}/no-show")
async def mark_no_show(appointment_id: str, bot: Bot = Depends(verify_bot_access)):
    client = get_appointments_client()
    await _verify_appointment_ownership(bot, appointment_id, client)
    try:
        appointment = await client.mark_no_show(appointment_id)
    except httpx.HTTPStatusError as exc:
        _raise_upstream_error(exc)
    return {"success": True, "appointment": appointment}
