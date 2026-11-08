"""
Voice Text Service - turno escrito del canal de voz, sin Deepgram (ADR-040).

El canal de voz del APK tiene dos modos sobre el mismo agente del bot:

- **Voz**: el proxy WS (`voice_router._bridge`) transporta PCM a Deepgram
  Agent, que hace STT/TTS y llama al LLM del tenant (ADR-034/ADR-038).
- **Texto**: este servicio corre el turno con `AgentService.run_turn`
  (prompt, tools, RAG e historial del bot) y devuelve la respuesta por HTTP.

Así el modo texto no abre sesión de Deepgram ni sintetiza voz: no hay minutos
de agente ni audio descartado en el cliente. La persistencia, la notificación
al staff y los contadores replican lo que hace `_bridge` con cada
`ConversationText`, con `metadata["source"] = "text"` para distinguir el origen.

Igual que en voz, el turno usa solo las contribuciones **sin estado** del
agente (`session=None`): los interceptores y widgets de los módulos son de los
canales con sesión de chat persistente.
"""

from __future__ import annotations

import logging
from typing import Optional

from app.claude_service import ChatMessage
from app.connection_manager import notify_staff_of_client_message
from app.conversation_service import get_conversation_service
from app.services.agent_service import get_agent_service
from app.services.client_service import get_client_service

logger = logging.getLogger(__name__)

HISTORY_LIMIT = 20


class TextTurnError(RuntimeError):
    """El turno escrito no produjo respuesta (sin proveedor de IA, LLM vacío)."""


def chat_history(
    conversation: Optional[dict], limit: int = HISTORY_LIMIT
) -> list[ChatMessage]:
    """Últimos turnos de la conversación en el formato del LLM.

    Misma ventana que `voice_session_service.history_messages` (que produce el
    formato `History` de Deepgram): el modo texto reanuda el mismo contexto.
    """
    if not conversation:
        return []
    messages = conversation.get("messages") or []
    return [
        ChatMessage(role=m.get("role", "user"), content=m.get("content", ""))
        for m in messages[-limit:]
        if m.get("role") in ("user", "assistant") and m.get("content")
    ]


async def run_text_turn(bot, channel, device_id: str, content: str) -> dict:
    """Resuelve un turno escrito y devuelve la respuesta lista para el cliente.

    Reutiliza la última conversación del dispositivo (bot + canal) para que el
    historial no se fragmente entre reconexiones; si no hay, crea una.
    Lanza `TextTurnError` si el tenant no tiene proveedor de IA configurado.
    """
    conv_service = get_conversation_service()
    client_service = get_client_service()
    client = await client_service.get_or_create_client(
        bot_id=bot.bot_id,
        external_id=device_id,
        source="voice",
        channel_id=channel.channel_id,
    )

    latest = await conv_service.get_latest_conversation_by_user(
        device_id, bot.bot_id, channel.channel_id
    )
    if latest:
        conversation_id = latest["conversation_id"]
    else:
        conversation_id = await conv_service.create_conversation(
            user_id=device_id,
            bot_id=bot.bot_id,
            client_id=client.client_id,
            channel="voice",
            metadata={
                "source": "text",
                "channel_id": channel.channel_id,
                "device_id": device_id,
            },
        )
        latest = None

    turn = await get_agent_service().run_turn(
        bot,
        client=client,
        client_id=client.client_id,
        user_text=content,
        history=chat_history(latest),
        canal="voice",
    )
    if not turn.message:
        # `run_turn` no propaga la excepción: devuelve el turno sin mensaje.
        raise TextTurnError(
            "El tenant no tiene configurado un proveedor de IA "
            "(Ajustes › Proveedor de IA)"
        )

    await conv_service.add_message(
        conversation_id, "user", content, {"source": "text"}
    )
    await conv_service.add_message(
        conversation_id,
        "assistant",
        turn.message,
        {"source": "text", **turn.metadata},
    )

    label = client.name or client.client_id[:8]
    try:
        await notify_staff_of_client_message(
            bot_id=client.bot_id,
            conversation_id=conversation_id,
            client_id=client.client_id,
            client_label=label,
            content=content,
            channel="voice",
        )
    except Exception:
        logger.exception(
            "Error notificando al staff el turno de texto (conversation_id=%s)",
            conversation_id,
        )

    try:
        await client_service.increment_counters(client.client_id, messages=1)
    except Exception:
        logger.exception(
            "Error actualizando contadores del cliente (client_id=%s)", client.client_id
        )

    return {
        "conversation_id": conversation_id,
        "device_id": device_id,
        "reply": turn.message,
        "model": turn.metadata.get("model"),
        "tokens_used": turn.metadata.get("tokens_used"),
        "estimated_cost_usd": turn.metadata.get("estimated_cost_usd"),
    }
