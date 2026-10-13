"""
Extensión de chat del módulo `appointments`.

La reserva de turnos se dispara únicamente cuando el propio LLM invoca la tool
`iniciar_reserva_turno` (siguiendo sus instrucciones de configuración — no por
palabra clave sobre el texto crudo del usuario). A partir de ahí la
mini-conversación de booking la conduce este interceptor, sin volver a pasar
por el LLM.

Estado por sesión de chat, en el namespace del módulo (`ns`):
- `ns["state"]`: BookingState activo (lo escribe el executor de la tool y lo
  consume/actualiza el interceptor).
- `ns["log"]`: metadata para el registro de la conversación (`booking_stage`).
"""

from __future__ import annotations

from typing import Optional

from app.services.appointment_booking_service import (
    BOOKING_TOOL_NAME,
    BOOKING_TOOL_SPEC,
    build_booking_tool_executor,
)


def _stage_log(ns: dict) -> None:
    state = ns.get("state")
    ns["log"] = {"booking_stage": state.stage.value if state is not None else None}


def provide_tools(bot, client, client_id, canal, ns: dict):
    """Tool de inicio de reserva (ver appointment_booking_service.py).

    El estado que exporta el executor va al namespace del módulo, así el
    interceptor de los próximos turnos lo retoma en vez de volver al LLM.
    """
    inner = build_booking_tool_executor(bot, client_id, ns)

    def _executor(tool_name: str, args: dict) -> dict:
        result = inner(tool_name, args)
        _stage_log(ns)
        return result

    return [BOOKING_TOOL_SPEC], {BOOKING_TOOL_NAME: _executor}


async def intercept(bot, client_id: Optional[str], user_text: str, ns: dict) -> Optional[dict]:
    """Continúa la reserva en curso, si hay una, con prioridad sobre el LLM."""
    state = ns.get("state")
    if state is None:
        return None

    result = await state.process_answer(user_text)
    _stage_log(ns)

    if result["done"] or result["cancelled"]:
        ns["state"] = None

    return {"message": result["message"], "widget": result.get("widget")}
