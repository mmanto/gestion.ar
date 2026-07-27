"""
Client Field Extraction Service

Durante el chat en vivo -- a diferencia de conversation_summary_service.py,
que solo corre bajo demanda manual desde el panel de conversaciones -- esto
extrae nombre/email/teléfono/DNI apenas el usuario los menciona en un
mensaje (ej. "soy Juan Pérez, DNI 12345678" mientras reserva un turno) y
actualiza el Client al vuelo, sin esperar a que termine ningún flujo
estructurado.

Se dispara en background (asyncio.create_task, ver web_chat_router.py) para
no sumarle latencia a la respuesta del bot. Se salta la llamada al LLM por
completo si el cliente ya tiene los 4 campos, así una conversación larga deja
de pagar el costo apenas los datos quedan completos.
"""

import json
import re
from typing import Any, Dict, Optional

from app.claude_service import get_llm_service
from app.models.client import ClientUpdate
from app.services.client_service import get_client_service

_JSON_BLOCK_RE = re.compile(r"\{.*\}", re.DOTALL)
_EMPTY_PLACEHOLDERS = {"null", "none", "n/a", "-", ""}

_FIELD_LABELS = {
    "name": "nombre y apellido",
    "email": "email",
    "phone": "teléfono",
    "dni": "DNI / documento de identidad",
}


def _is_present(value: Any) -> bool:
    if not value:
        return False
    if isinstance(value, str) and value.strip().lower() in _EMPTY_PLACEHOLDERS:
        return False
    return True


def _parse_json(raw: str) -> Optional[dict]:
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


async def capture_client_fields_from_message(client_id: str, user_text: str) -> Optional[Dict[str, Any]]:
    """
    Si al cliente le falta nombre, email, teléfono o DNI, le pide al LLM que
    extraiga -- SOLO si aparecen explícitamente en este mensaje -- los que
    falten, y actualiza el Client con lo encontrado. Nunca pisa datos ya
    cargados. Retorna los campos actualizados, o None si no había nada para
    hacer (cliente ya completo, o el mensaje no menciona nada nuevo).
    """
    client_service = get_client_service()
    client = await client_service.get_client(client_id)
    if not client:
        return None

    existing = {"name": client.name, "email": client.email, "phone": client.phone, "dni": client.dni}
    missing = [field for field in _FIELD_LABELS if not _is_present(existing[field])]
    if not missing:
        return None

    field_lines = "\n".join(f'- "{field}": {_FIELD_LABELS[field]}' for field in missing)
    example_keys = ", ".join(f'"{field}": "..."' for field in missing)
    prompt = (
        "Analizá este mensaje de un usuario en un chat de reserva de turnos. "
        "Extraé, SOLO si aparece explícitamente en el mensaje (usá null si no "
        f"aparece), estos datos:\n{field_lines}\n\n"
        "Respondé ÚNICAMENTE con un JSON plano, sin texto antes ni después ni "
        f"bloques de código markdown: {{{example_keys}}}"
    )

    llm = get_llm_service()
    response = await llm.generate_rag_response(
        user_message=user_text,
        rag_context="",
        system_prompt=prompt,
        # 600, no menos: con proveedores "thinking" (ver OLLAMA_MODEL) el
        # razonamiento interno consume num_predict antes de llegar al JSON
        # final -- con valores bajos (ej. 200) devolvía string vacío.
        max_tokens=600,
    )

    parsed = _parse_json(response.response)
    if not parsed:
        return None

    to_update = {field: parsed.get(field) for field in missing if _is_present(parsed.get(field))}
    if not to_update:
        return None

    await client_service.update_client(client_id, ClientUpdate(**to_update))
    return to_update
