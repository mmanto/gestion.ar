"""
Conversation Summary Service

Genera un resumen ejecutivo de una conversación completa y actualiza el
Client asociado con los datos mínimos que declare bot.config.flow.steps para
ese bot (ver conversation_flow_service.py) — mismo concepto de "datos
mínimos" que ya usa el flow en vivo, pero acá se le pasa la conversación
entera al LLM en un solo pedido en vez de preguntar campo por campo.

Acción manual bajo demanda desde el listado de conversaciones (ver
main.py: POST /api/conversations/{id}/summary) — no se dispara sola durante
el chat, a diferencia del flow o de la tool de auto-calificación por
semáforo.
"""

import json
import logging
from typing import Any, Dict, List

from app.claude_service import get_llm_service
from app.conversation_service import get_conversation_service
from app.models.bot import FlowStep
from app.models.client import ClientUpdate
from app.services.bot_service import get_bot_service
from app.services.client_service import get_client_service
from app.services.conversation_flow_service import map_captured_fields_to_client_update

logger = logging.getLogger(__name__)

_GENERIC_PROMPT = (
    "Analizá la siguiente conversación entre un agente virtual y un usuario y "
    "escribí un resumen ejecutivo breve (3-5 líneas) del caso: qué necesita el "
    "usuario y cualquier contexto útil para que un humano lo retome sin releer "
    "toda la conversación.\n\n"
    'Respondé ÚNICAMENTE con un JSON, sin texto antes ni después: {"summary": "...", "fields": {}}'
)


def _build_extraction_prompt(steps: List[FlowStep]) -> str:
    if not steps:
        return _GENERIC_PROMPT

    field_lines = "\n".join(f'- "{s.field}" ({s.field_type}): {s.question}' for s in steps)
    return (
        "Analizá la siguiente conversación entre un agente virtual y un usuario. "
        "Hacé dos cosas:\n"
        "1. Escribí un resumen ejecutivo breve (3-5 líneas) del caso: qué necesita "
        "el usuario, datos relevantes mencionados, y cualquier contexto útil para "
        "que un humano retome el caso sin releer toda la conversación.\n"
        "2. Extraé, SOLO si aparecen explícitamente en la conversación, estos datos:\n"
        f"{field_lines}\n\n"
        "Respondé ÚNICAMENTE con un JSON con esta forma exacta, sin texto antes ni "
        "después:\n"
        '{"summary": "...", "fields": {"<field>": "<valor o null si no aparece>"}}'
    )


def _transcript(messages: List[Dict[str, Any]]) -> str:
    return "\n".join(f"{m['role']}: {m['content']}" for m in messages)


async def generate_summary_and_update_client(conversation_id: str) -> Dict[str, Any]:
    """
    Devuelve {"summary": str, "client_id": str, "updated_fields": List[str]}.
    Lanza ValueError (400) si la conversación/cliente no existen o no hay
    nada que resumir.
    """
    conv_service = get_conversation_service()
    conversation = await conv_service.get_conversation(conversation_id)
    if not conversation:
        raise ValueError("Conversación no encontrada")

    bot_id = conversation.get("bot_id")
    client_id = conversation.get("client_id")
    messages = conversation.get("messages") or []
    if not client_id:
        raise ValueError("La conversación no tiene un cliente asociado")
    if not messages:
        raise ValueError("La conversación no tiene mensajes")

    steps: List[FlowStep] = []
    if bot_id:
        bot = await get_bot_service().get_bot(bot_id)
        if bot and bot.config.flow and bot.config.flow.steps:
            steps = bot.config.flow.steps

    llm = get_llm_service()
    response = await llm.generate_rag_response(
        user_message=_transcript(messages),
        rag_context="",
        system_prompt=_build_extraction_prompt(steps),
        max_tokens=600,
    )

    summary = ""
    extracted: Dict[str, Any] = {}
    try:
        parsed = json.loads(response.response)
        summary = str(parsed.get("summary") or "").strip()
        extracted = {k: v for k, v in (parsed.get("fields") or {}).items() if v}
    except (json.JSONDecodeError, AttributeError, TypeError) as e:
        logger.warning("No se pudo parsear la respuesta del LLM como JSON: %s", e)
        summary = (response.response or "").strip()

    client_service = get_client_service()
    client = await client_service.get_client(client_id)
    if not client:
        raise ValueError("El cliente asociado a la conversación ya no existe")

    # No pisar datos ya cargados — mismo criterio que el flow en vivo
    # (skip_if_known): solo completa los campos que el cliente aún no tiene.
    existing = {"name": client.name, "email": client.email, "phone": client.phone, "dni": client.dni}
    to_fill = {field: value for field, value in extracted.items() if not existing.get(field)}

    update_data = map_captured_fields_to_client_update(to_fill)
    if summary:
        update_data["notas"] = summary

    if update_data:
        await client_service.update_client(client_id, ClientUpdate(**update_data))

    return {
        "summary": summary,
        "client_id": client_id,
        "updated_fields": list(to_fill.keys()),
    }
