"""
Extensión de chat del módulo `lead_funnel`.

Si el bot tiene `config.flow` habilitado, el embudo responde antes del LLM. Si
tiene `ius_config` cargado, ese JSON es el guión completo de la conversación y
tiene prioridad: el flujo fijo no intercepta (si no, el system prompt del bot
nunca se llegaría a usar).

Estado por sesión de chat, en el namespace del módulo (`ns`):
- `ns["state"]`: FlowState activo.
- `ns["log"]`: metadata para el registro de la conversación (`flow_field`).
"""

from __future__ import annotations

from typing import Optional

from app.models.client import ClientUpdate
from app.services.client_service import get_client_service
from app.services.conversation_flow_service import FlowState, create_flow_state


def provide_tools(bot, client, client_id, canal, ns: dict):
    """El embudo no aporta tools: su interfaz es la conversación misma."""
    return [], {}


def _flow_configured(bot) -> bool:
    return bool(
        not bot.config.ius_config
        and bot.config.flow
        and bot.config.flow.enabled
        and bot.config.flow.steps
    )


async def startup(bot, client_id: Optional[str], ns: dict) -> Optional[dict]:
    """Arranca el embudo al abrir la sesión y devuelve su primera pregunta."""
    if not _flow_configured(bot):
        return None

    existing_data = None
    if client_id:
        try:
            client = await get_client_service().get_client(client_id)
            if client:
                existing_data = {
                    "name": client.name,
                    "email": client.email,
                    "phone": client.phone,
                }
        except Exception:
            pass

    flow_state = create_flow_state(
        bot.config.flow,
        client_id=client_id,
        existing_client_data=existing_data,
    )
    ns["state"] = flow_state
    ns["config"] = bot.config.flow

    if flow_state.is_complete:
        return None

    question = flow_state.get_current_question()
    return {"message": question} if question else None


async def intercept(bot, client_id: Optional[str], user_text: str, ns: dict) -> Optional[dict]:
    """Un paso del embudo: valida la respuesta, avanza el estado y responde."""
    state: Optional[FlowState] = ns.get("state")
    if state is None or state.is_complete:
        return None

    result = state.process_answer(user_text)
    ns["log"] = {"flow_field": result.get("captured_field")}

    if not result["valid"]:
        return {"message": result.get("error") or "Por favor, inténtalo de nuevo.", "widget": None}

    if result["is_complete"]:
        await _persist_captured_fields(bot, client_id, state)
        config = ns.get("config") or bot.config.flow
        return {"message": config.completion_message, "widget": None}

    return {"message": result.get("next_question"), "widget": None}


async def _persist_captured_fields(bot, client_id: Optional[str], flow_state: FlowState) -> None:
    """Al completar el embudo, vuelca lo capturado al cliente (datos + score)."""
    if not client_id:
        return

    raw_update = flow_state.get_client_update_data()
    if not raw_update:
        return

    try:
        client_update = ClientUpdate(
            name=raw_update.get("name"),
            email=raw_update.get("email"),
            phone=raw_update.get("phone"),
            dni=raw_update.get("dni"),
            metadata=raw_update.get("metadata"),
        )
        await get_client_service().update_client(client_id, client_update)

        score_bonus = flow_state.get_lead_score_bonus()
        if score_bonus > 0:
            await get_client_service().increment_counters(
                client_id, messages=int(score_bonus * 10)
            )
    except Exception:
        pass
