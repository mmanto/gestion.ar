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
import re
from typing import Any, Dict, List, Optional

from app.claude_service import get_llm_service
from app.conversation_service import get_conversation_service
from app.models.bot import FlowStep
from app.models.client import ClientUpdate
from app.services.bot_service import get_bot_service
from app.services.client_service import get_client_service
from app.services.conversation_flow_service import map_captured_fields_to_client_update

_JSON_BLOCK_RE = re.compile(r"\{.*\}", re.DOTALL)

_GENERIC_PROMPT = (
    "Analizá la siguiente conversación entre un agente virtual y un usuario y "
    "escribí un resumen ejecutivo breve (3-5 líneas) del caso: qué necesita el "
    "usuario y cualquier contexto útil para que un humano lo retome sin releer "
    "toda la conversación.\n\n"
    "Respondé ÚNICAMENTE con un JSON, sin texto antes ni después ni bloques de "
    'código markdown: {"summary": "..."}'
)


def _build_extraction_prompt(steps: List[FlowStep]) -> str:
    if not steps:
        return _GENERIC_PROMPT

    # Estructura plana (sin anidar bajo "fields"): cuantos menos niveles, más
    # chances de que el modelo la respete al pie de la letra — probado en
    # producción que anidar hacía que el modelo mencionara el dato en el
    # resumen en texto libre pero no lo replicara en el JSON estructurado.
    field_lines = "\n".join(f'- "{s.field}" ({s.field_type}): {s.question}' for s in steps)
    example_keys = ", ".join(f'"{s.field}": "..."' for s in steps)
    return (
        "Analizá la siguiente conversación entre un agente virtual y un usuario. "
        "Hacé dos cosas:\n"
        "1. Escribí un resumen ejecutivo breve (3-5 líneas) del caso: qué necesita "
        "el usuario, datos relevantes mencionados, y cualquier contexto útil para "
        "que un humano retome el caso sin releer toda la conversación.\n"
        "2. Extraé, SOLO si aparecen explícitamente en la conversación (usá null si "
        "no aparece), estos datos:\n"
        f"{field_lines}\n\n"
        "Respondé ÚNICAMENTE con un JSON PLANO con esta forma exacta (todas las "
        "claves al mismo nivel, ninguna anidada), sin texto antes ni después ni "
        "bloques de código markdown:\n"
        f'{{"summary": "...", {example_keys}}}'
    )


def _transcript(messages: List[Dict[str, Any]]) -> str:
    return "\n".join(f"{m['role']}: {m['content']}" for m in messages)


_EMPTY_PLACEHOLDERS = {"null", "none", "n/a", "-", ""}


def _is_present(value: Any) -> bool:
    """True si el LLM realmente extrajo un dato — filtra tanto el JSON null
    real como el caso (frecuente en modelos más chicos) de que devuelva la
    STRING literal "null"/"none" en vez del literal JSON."""
    if not value:
        return False
    if isinstance(value, str) and value.strip().lower() in _EMPTY_PLACEHOLDERS:
        return False
    return True


def _extract_json(raw: str) -> Optional[dict]:
    """Parsea el JSON de la respuesta del LLM, tolerando texto/markdown
    alrededor (algunos modelos anteponen una frase pese a la instrucción de
    responder solo JSON)."""
    raw = (raw or "").strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    match = _JSON_BLOCK_RE.search(raw)
    if not match:
        return None
    try:
        return json.loads(match.group())
    except json.JSONDecodeError:
        return None


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

    parsed = _extract_json(response.response)
    summary = ""
    extracted: Dict[str, Any] = {}
    print(
        f"[conversation_summary] conversation_id={conversation_id} steps={[s.field for s in steps]} "
        f"raw_response={response.response!r} parsed={parsed!r}",
        flush=True,
    )
    if parsed is None:
        summary = (response.response or "").strip()
    else:
        summary = str(parsed.get("summary") or "").strip()
        known_fields = {s.field for s in steps}
        # Acepta tanto el formato plano ({"summary": ..., "name": ...}) como
        # el anidado bajo "fields" (por si el modelo igual lo agrupa así) —
        # se toma lo que efectivamente haya, priorizando el nivel plano.
        nested = parsed.get("fields") if isinstance(parsed.get("fields"), dict) else {}
        for field in known_fields:
            value = parsed.get(field, nested.get(field))
            if _is_present(value):
                extracted[field] = value
        if not steps:
            extracted = {k: v for k, v in nested.items() if _is_present(v)}
        print(f"[conversation_summary] extracted={extracted!r}", flush=True)

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
