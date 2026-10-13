"""
Web Chat Router - QR Code generation and WebSocket chat for web channel
"""

import asyncio
import io
import json
import logging
import traceback
import uuid
from typing import List, Optional

import qrcode
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import Response

from app.auth_service import User
from app.dependencies.auth import get_current_user
from app.claude_service import ChatMessage, get_effective_welcome_message
from app.connection_manager import connection_manager, notify_staff_of_client_message
from app.conversation_service import get_conversation_service
from app.services.agent_service import get_agent_service
from app.services.bot_service import get_bot_service
from app.services.channel_service import get_channel_service
from app.services.client_service import get_client_service
from app.services.tenant_service import get_tenant_service
from app.services.client_field_extraction_service import capture_client_fields_from_message
from app.models.client import Client

logger = logging.getLogger(__name__)

router = APIRouter(tags=["web-chat"])


async def _notify_staff(
    bot_id: str,
    conversation_id: str,
    client_id: str | None,
    client_label: str,
    content: str,
    channel: str = "web",
) -> None:
    """Notifica a todo el staff de un mensaje de cliente (WS + push)."""
    await notify_staff_of_client_message(
        bot_id=bot_id,
        conversation_id=conversation_id,
        client_id=client_id,
        client_label=client_label,
        content=content,
        channel=channel,
    )


async def _capture_client_fields_background(client_id: str, user_text: str) -> None:
    """Fire-and-forget: nunca debe tumbar el loop del websocket ni sumarle
    latencia a la respuesta del bot (ver client_field_extraction_service.py)."""
    try:
        await capture_client_fields_from_message(client_id, user_text)
    except Exception:
        logger.exception("Error extrayendo datos del cliente en vivo (client_id=%s)", client_id)


# ---------------------------------------------------------------------------
# QR Code endpoint (requiere autenticación — solo el admin puede generarlo)
# ---------------------------------------------------------------------------

@router.get("/api/bots/{bot_id}/qr-code")
async def get_qr_code(
    bot_id: str,
    base_url: str = Query(..., description="URL base de la app, p.ej. https://miapp.com"),
    current_user: User = Depends(get_current_user),
):
    """
    Genera y devuelve un QR code en PNG que codifica la URL del chat web del bot.
    Requiere autenticación de administrador.
    """
    bot_service = get_bot_service()
    bot = await bot_service.get_bot(bot_id)
    if not bot or bot.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=404, detail="Bot no encontrado")

    chat_url = f"{base_url.rstrip('/')}/chat/{bot_id}"

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(chat_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    return Response(content=buf.read(), media_type="image/png")


# ---------------------------------------------------------------------------
# WebSocket chat endpoint (público — no requiere autenticación)
# ---------------------------------------------------------------------------

@router.websocket("/ws/chat/{bot_id}")
async def websocket_chat(websocket: WebSocket, bot_id: str, device_id: Optional[str] = Query(None)):
    """
    Canal de chat web en tiempo real para un bot.
    Público: el usuario llega escaneando un QR code, sin autenticarse.
    Cada conexión crea una conversación nueva en PostgreSQL (channel='web').
    Si se recibe device_id, se reutiliza el cliente existente del dispositivo.
    """
    await websocket.accept()

    bot_service = get_bot_service()
    conv_service = get_conversation_service()

    # Cargar configuración del bot (sin validar owner, es público)
    bot = await bot_service.get_bot(bot_id)
    if not bot:
        await websocket.send_json({"type": "error", "message": "Bot no encontrado"})
        await websocket.close(code=4004)
        return

    tenant = await get_tenant_service().get_tenant(bot.tenant_id)
    tenant_name = tenant.name if tenant else bot.name

    # Usar device_id estable del cliente si lo envía, o generar uno nuevo
    session_id = device_id if device_id else str(uuid.uuid4())
    web_client_id: Optional[str] = None
    web_client: Optional[Client] = None
    try:
        client_service = get_client_service()
        web_client = await client_service.get_or_create_client(
            bot_id=bot_id,
            external_id=session_id,
            source="web",
        )
        web_client_id = web_client.client_id
    except Exception:
        pass

    conversation_id = await conv_service.create_conversation(
        user_id=session_id,
        bot_id=bot_id,
        client_id=web_client_id,
        channel="web",
        metadata={"source": "web", "session_id": session_id},
    )

    # Mensaje de bienvenida
    await websocket.send_json(
        {
            "type": "welcome",
            "session_id": session_id,
            "conversation_id": conversation_id,
            "message": get_effective_welcome_message(bot.config),
            "bot_name": bot.name,
            "tenant_name": tenant_name,
        }
    )

    # Registrar conexión activa para mensajes de agente
    connection_manager.register(conversation_id, websocket)

    # Pre-cargar el welcome como primer turno del asistente para que Claude no lo repita
    conversation_history: List[ChatMessage] = [
        ChatMessage(role="assistant", content=get_effective_welcome_message(bot.config))
    ]

    # Estado por conexión de las extensiones de chat de los módulos (reserva de
    # turnos, embudo de leads, ...) — ver AgentService.
    session: dict = {}

    try:
        while True:
            raw = await websocket.receive_text()

            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            if data.get("type") != "message":
                continue

            user_text = (data.get("content") or "").strip()
            if not user_text:
                continue

            if web_client_id:
                asyncio.create_task(_capture_client_fields_background(web_client_id, user_text))

            # Indicar que el bot está "escribiendo"
            await websocket.send_json({"type": "typing", "status": True})

            try:
                result = await get_agent_service().run_turn(
                    bot,
                    client=web_client,
                    client_id=web_client_id,
                    user_text=user_text,
                    history=conversation_history,
                    canal="web",
                    session=session,
                )

                if result.message:
                    # Persistir en PostgreSQL -- nunca debe impedir que la
                    # respuesta real le llegue al usuario (ver bug: conversation_id
                    # no encontrado dejaba la respuesta sin enviar más abajo).
                    try:
                        await conv_service.log_chat_interaction(
                            user_id=session_id,
                            user_message=user_text,
                            assistant_response=result.message,
                            metadata={"source": "web", **result.metadata},
                            conversation_id=conversation_id,
                            bot_id=bot_id,
                            client_id=web_client_id,
                            channel="web",
                        )
                    except Exception:
                        logger.exception(
                            "Error registrando interacción en conversación (conversation_id=%s)",
                            conversation_id,
                        )

                # Notificar a staff conectado
                await _notify_staff(
                    bot_id, conversation_id, web_client_id,
                    web_client_id or session_id[:8], user_text,
                )

                # Actualizar contadores del cliente
                if result.llm and web_client_id:
                    try:
                        await get_client_service().increment_counters(web_client_id, messages=1)
                    except Exception:
                        pass

                if result.message:
                    payload = {"type": "message", "role": "assistant", "content": result.message}
                    if result.widget:
                        payload["metadata"] = result.widget
                    elif result.llm and not result.started:
                        payload["metadata"] = {
                            "tokens_used": result.metadata.get("tokens_used"),
                            "model": result.metadata.get("model"),
                        }
                    await websocket.send_json(payload)

            except Exception as e:
                logger.error("Error generando respuesta (bot_id=%s): %s\n%s", bot_id, e, traceback.format_exc())
                await websocket.send_json(
                    {"type": "error", "message": bot.config.fallback_message}
                )

            finally:
                await websocket.send_json({"type": "typing", "status": False})

    except WebSocketDisconnect:
        pass
    except Exception:
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
    finally:
        connection_manager.unregister(conversation_id)


@router.websocket("/ws/chat/channel/{channel_id}")
async def websocket_chat_by_channel(websocket: WebSocket, channel_id: str, device_id: Optional[str] = Query(None)):
    """
    Canal de chat web en tiempo real usando channel_id (canal tipo 'web').
    El channel_id identifica el canal; el bot se obtiene a partir de él.
    Genera conversaciones con channel='web' y registra el channel_id en metadata.
    Si se recibe device_id, se reutiliza el cliente existente del dispositivo.
    """
    await websocket.accept()

    channel_service = get_channel_service()
    bot_service = get_bot_service()
    conv_service = get_conversation_service()

    # Cargar el canal
    channel = await channel_service.get_channel(channel_id)
    if not channel:
        await websocket.send_json({"type": "error", "message": "Canal no encontrado"})
        await websocket.close(code=4004)
        return

    if channel.channel_type not in ("web", "pwa"):
        await websocket.send_json({"type": "error", "message": "El canal no es de tipo web o pwa"})
        await websocket.close(code=4003)
        return

    if channel.status != "active":
        await websocket.send_json({"type": "error", "message": "El canal no está activo"})
        await websocket.close(code=4003)
        return

    # Cargar el bot asociado al canal
    bot = await bot_service.get_bot(channel.bot_id)
    if not bot:
        await websocket.send_json({"type": "error", "message": "Bot no encontrado"})
        await websocket.close(code=4004)
        return

    tenant = await get_tenant_service().get_tenant(bot.tenant_id)
    tenant_name = tenant.name if tenant else bot.name

    # Actualizar contador de actividad del canal
    await channel_service.increment_message_counters(channel_id, received=0, sent=0)

    # Determinar la fuente según el tipo de canal
    channel_source = "pwa" if channel.channel_type == "pwa" else "web"

    # Usar device_id estable del cliente si lo envía, o generar uno nuevo
    session_id = device_id if device_id else str(uuid.uuid4())
    channel_client_id: Optional[str] = None
    channel_client: Optional[Client] = None
    try:
        client_service = get_client_service()
        channel_client = await client_service.get_or_create_client(
            bot_id=channel.bot_id,
            external_id=session_id,
            source=channel_source,
            channel_id=channel.channel_id,
        )
        channel_client_id = channel_client.client_id
    except Exception:
        pass

    # Cargar historial de la conversación anterior (si existe), pero siempre crear una nueva
    history_messages = []
    if device_id:
        try:
            existing_conv = await conv_service.get_latest_conversation_by_user(
                user_id=session_id,
                bot_id=channel.bot_id,
                channel_id=channel_id,
            )
            if existing_conv:
                history_messages = existing_conv.get("messages", [])
        except Exception:
            pass

    # Siempre crear una nueva conversación para evitar race conditions en connection_manager
    conversation_id = await conv_service.create_conversation(
        user_id=session_id,
        bot_id=channel.bot_id,
        client_id=channel_client_id,
        channel=channel_source,
        metadata={"source": channel_source, "session_id": session_id, "channel_id": channel_id},
    )

    await websocket.send_json(
        {
            "type": "welcome",
            "session_id": session_id,
            "conversation_id": conversation_id,
            "message": get_effective_welcome_message(bot.config),
            "bot_name": bot.name,
            "tenant_name": tenant_name,
            "history": history_messages,
        }
    )

    # Registrar conexión activa para mensajes de agente
    connection_manager.register(conversation_id, websocket)

    # Pre-cargar el welcome como primer turno del asistente para que Claude no lo repita
    conversation_history: List[ChatMessage] = [
        ChatMessage(role="assistant", content=get_effective_welcome_message(bot.config))
    ]

    # Estado por conexión de las extensiones de chat de los módulos (embudo de
    # leads, reserva de turnos, ...) — ver AgentService. Acá SÍ se les pide que
    # arranquen la conversación (p. ej. la primera pregunta del embudo), a
    # diferencia del WS por bot, donde el embudo no aplica.
    session: dict = {}
    startup = await get_agent_service().start_session(
        bot, client_id=channel_client_id, session=session
    )
    if startup and startup.get("message"):
        await websocket.send_json(
            {"type": "message", "role": "assistant", "content": startup["message"]}
        )

    try:
        while True:
            raw = await websocket.receive_text()

            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            if data.get("type") != "message":
                continue

            user_text = (data.get("content") or "").strip()
            if not user_text:
                continue

            if channel_client_id:
                asyncio.create_task(_capture_client_fields_background(channel_client_id, user_text))

            await websocket.send_json({"type": "typing", "status": True})

            try:
                result = await get_agent_service().run_turn(
                    bot,
                    client=channel_client,
                    client_id=channel_client_id,
                    user_text=user_text,
                    history=conversation_history,
                    canal=channel_source,
                    session=session,
                )

                if result.message:
                    # Nunca debe impedir que la respuesta real (ya generada por el
                    # LLM) le llegue al usuario más abajo -- ver bug: un
                    # conversation_id no encontrado en este log dejaba la
                    # respuesta real sin enviar y el chat parecía "colgado".
                    try:
                        await conv_service.log_chat_interaction(
                            user_id=session_id,
                            user_message=user_text,
                            assistant_response=result.message,
                            metadata={
                                "source": channel_source,
                                "channel_id": channel_id,
                                **result.metadata,
                            },
                            conversation_id=conversation_id,
                            bot_id=channel.bot_id,
                            client_id=channel_client_id,
                            channel=channel_source,
                        )
                    except Exception:
                        logger.exception(
                            "Error registrando interacción en conversación (conversation_id=%s)",
                            conversation_id,
                        )

                await _notify_staff(
                    channel.bot_id, conversation_id, channel_client_id,
                    channel_client_id or session_id[:8], user_text, channel_source,
                )

                # Actualizar contadores del cliente (sólo en los turnos que
                # resolvió el LLM, igual que antes)
                if result.llm:
                    if channel_client_id:
                        try:
                            await get_client_service().increment_counters(channel_client_id, messages=1)
                        except Exception:
                            pass

                    await channel_service.increment_message_counters(channel_id, received=1, sent=1)

                if result.message:
                    payload = {"type": "message", "role": "assistant", "content": result.message}
                    if result.widget:
                        payload["metadata"] = result.widget
                    elif result.llm and not result.started:
                        payload["metadata"] = {
                            "tokens_used": result.metadata.get("tokens_used"),
                            "model": result.metadata.get("model"),
                        }
                    await websocket.send_json(payload)

            except Exception as e:
                logger.error("Error generando respuesta (channel_id=%s): %s\n%s", channel_id, e, traceback.format_exc())
                await websocket.send_json(
                    {"type": "error", "message": bot.config.fallback_message}
                )

            finally:
                await websocket.send_json({"type": "typing", "status": False})

    except WebSocketDisconnect:
        pass
    except Exception:
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
    finally:
        connection_manager.unregister(conversation_id)
