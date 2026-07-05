"""
Webhook receptor de devbout-appointments (integración de referencia, Fase 4
del plan de turnos): verifica la firma HMAC saliente del microservicio y
notifica al bot dueño del turno vía el canal de push ya existente
(push_service.broadcast_to_bot). Alcance deliberadamente acotado a probar
el cableado end-to-end (microservicio -> webhook -> notificación), no un
flujo de reserva completo dentro del bot conversacional.
"""
import hashlib
import hmac
import logging
import os

from fastapi import APIRouter, Header, HTTPException, Request

from app.models.push_subscription import SendNotificationRequest
from app.services.push_service import get_push_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhook/appointments", tags=["Appointments Webhooks"])


def _verify_signature(body: bytes, signature: str | None) -> bool:
    secret = os.getenv("APPOINTMENTS_WEBHOOK_SECRET", "")
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


_EVENT_MESSAGES = {
    "appointment.created": ("Nuevo turno reservado", "Turno para {customer_ref} el {start_at}"),
    "appointment.cancelled": ("Turno cancelado", "Se canceló el turno de {customer_ref} del {start_at}"),
    "reminder.due": ("Recordatorio de turno", "Turno de {customer_ref} el {start_at}"),
}


@router.post("")
async def receive_appointments_webhook(
    request: Request,
    x_appointments_signature: str | None = Header(None, alias="X-Appointments-Signature"),
):
    body = await request.body()
    if not _verify_signature(body, x_appointments_signature):
        raise HTTPException(401, "Firma inválida")

    event = await request.json()
    event_type = event.get("event_type")
    appointment = event.get("appointment", {})
    logger.info("Webhook de turnos recibido: %s (appointment_id=%s)", event_type, appointment.get("id"))

    bot_id = (appointment.get("metadata") or {}).get("bot_id")
    message = _EVENT_MESSAGES.get(event_type)
    if not bot_id or not message:
        logger.warning(
            "Webhook de turnos sin bot_id en metadata o event_type desconocido, no se notifica: %s",
            appointment.get("id"),
        )
        return {"received": True}

    title, body_template = message
    await get_push_service().broadcast_to_bot(
        bot_id=bot_id,
        request=SendNotificationRequest(
            title=title,
            body=body_template.format(customer_ref=appointment.get("customer_ref"), start_at=appointment.get("start_at")),
        ),
    )
    return {"received": True}
