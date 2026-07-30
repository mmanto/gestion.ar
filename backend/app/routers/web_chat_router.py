"""
Web Chat Router - QR Code generation and WebSocket chat for web channel
"""

import asyncio
import io
import json
import logging
import traceback
import uuid
from datetime import datetime, timezone
from typing import List, Optional

import qrcode
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from fastapi.responses import Response

from app.auth_service import User
from app.dependencies.auth import get_current_user
from app.claude_service import get_llm_service, ChatMessage, build_effective_system_prompt, get_effective_welcome_message
from app.connection_manager import connection_manager, notify_staff_of_client_message
from app.conversation_service import get_conversation_service
from app.rag_service import get_rag_service
from app.services.bot_service import get_bot_service
from app.services.channel_service import get_channel_service
from app.services.client_service import get_client_service
from app.services.conversation_flow_service import create_flow_state, FlowState
from app.services.module_service import get_module_service
from app.services.tenant_service import get_tenant_service
from app.services.appointment_booking_service import (
    BOOKING_TOOL_NAME,
    BOOKING_TOOL_SPEC,
    BookingState,
    build_booking_tool_executor,
    start_booking,
)
from app.services.client_field_extraction_service import capture_client_fields_from_message
from app.services.prospect_auto_qualify_service import (
    QUALIFICATION_TOOL_NAME,
    QUALIFICATION_TOOL_SPEC,
    build_qualification_tool_executor,
)
from app.models.client import Client, ClientUpdate

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


async def _build_llm_tools(bot, client: Optional[Client], client_id: Optional[str], canal: str):
    """
    Arma la lista de tools + executor dispatcher para una llamada al LLM
    (calificación por semáforo y/o inicio de reserva de turnos), y el
    "output box" donde build_booking_tool_executor exporta el BookingState
    si el LLM decide iniciar una reserva (ver appointment_booking_service.py).

    La reserva de turnos se dispara únicamente cuando el propio LLM invoca
    la tool, siguiendo sus instrucciones de configuración (ius_config u
    otras) — no por palabra clave sobre el texto crudo del usuario, que
    ignoraría por completo cualquier calificación previa del caso.
    """
    tools: List[dict] = []
    executors: dict = {}

    if bot.config.auto_qualify_colors and client:
        tools.append(QUALIFICATION_TOOL_SPEC)
        executors[QUALIFICATION_TOOL_NAME] = build_qualification_tool_executor(
            client=client, canal=canal, allowed_colors=bot.config.auto_qualify_colors,
        )

    booking_output: dict = {}
    if await get_module_service().is_enabled(bot.bot_id, "appointments"):
        tools.append(BOOKING_TOOL_SPEC)
        executors[BOOKING_TOOL_NAME] = build_booking_tool_executor(bot, client_id, booking_output)

    if not tools:
        return None, None, booking_output

    def _dispatch(tool_name: str, args: dict) -> dict:
        executor = executors.get(tool_name)
        if not executor:
            return {"error": f"Tool desconocida: {tool_name}"}
        return executor(tool_name, args)

    return tools, _dispatch, booking_output



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
    claude = get_llm_service()
    rag = get_rag_service()

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

    # Reserva de turnos por chat (ver appointment_booking_service.py): mismo
    # mecanismo que websocket_chat_by_channel — sin esto, ningún chat que
    # acceda por /chat/{botId} (modo 'bot') puede iniciar una reserva.
    booking_state: Optional[BookingState] = None


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
                # === Reserva de turnos: si hay una mini-conversación de booking
                # en curso para esta sesión, tiene prioridad sobre RAG. ===
                booking_result: Optional[dict] = None

                if booking_state is not None:
                    booking_result = await booking_state.process_answer(user_text)

                if booking_result is not None:
                    # Log de la interacción de booking -- nunca debe impedir que la
                    # respuesta real le llegue al usuario (ver bug: conversation_id
                    # no encontrado dejaba la respuesta sin enviar más abajo).
                    try:
                        await conv_service.log_chat_interaction(
                            user_id=session_id,
                            user_message=user_text,
                            assistant_response=booking_result["message"],
                            metadata={
                                "source": "web",
                                "booking_stage": booking_state.stage.value if booking_state else None,
                                "widget_type": (booking_result.get("widget") or {}).get("widget_type"),
                            },
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

                    payload = {"type": "message", "role": "assistant", "content": booking_result["message"]}
                    if booking_result.get("widget"):
                        payload["metadata"] = booking_result["widget"]
                    await websocket.send_json(payload)

                    if booking_result["done"] or booking_result["cancelled"]:
                        booking_state = None

                else:
                    # === Flujo normal: LLM (con tools de calificación por semáforo
                    # y/o inicio de reserva de turnos, si el bot los tiene habilitados
                    # — ver _build_llm_tools) ===
                    rag_context: Optional[str] = None
                    if bot.config.use_rag:
                        rag_context = rag.get_context(
                            user_text, bot_id=bot_id, n_results=bot.config.rag_results_count
                        )

                    tools, tool_dispatch, booking_output = await _build_llm_tools(
                        bot, web_client, web_client_id, "web"
                    )

                    # Llamar a Claude
                    response = await asyncio.to_thread(
                        _sync_generate,
                        claude,
                        user_text,
                        rag_context,
                        build_effective_system_prompt(bot.config),
                        conversation_history,
                        bot.config.max_tokens,
                        bot.config.llm_thinking or None,
                        tools,
                        tool_dispatch,
                    )

                    # Actualizar historial en memoria
                    conversation_history.append(ChatMessage(role="user", content=user_text))
                    conversation_history.append(
                        ChatMessage(role="assistant", content=response["response"])
                    )

                    # Si el LLM invocó la tool de inicio de reserva, lo que se le
                    # muestra al usuario es el mensaje/widget del booking (calendario),
                    # no la narración de texto de Claude — misma UX que el resto del
                    # flujo de booking más arriba.
                    started_booking = booking_output.get("result")
                    if started_booking is not None:
                        booking_state = booking_output.get("state")
                        outgoing_message = started_booking["message"]
                        widget = started_booking.get("widget")
                    else:
                        outgoing_message = response["response"]
                        widget = None

                    # Persistir en PostgreSQL -- nunca debe impedir que la
                    # respuesta real le llegue al usuario (ver bug: conversation_id
                    # no encontrado dejaba la respuesta sin enviar más abajo).
                    try:
                        await conv_service.log_chat_interaction(
                            user_id=session_id,
                            user_message=user_text,
                            assistant_response=outgoing_message,
                            metadata={
                                "model": response["model"],
                                "tokens_used": response["tokens_used"],
                                "input_tokens": response["input_tokens"],
                                "output_tokens": response["output_tokens"],
                                "estimated_cost_usd": response["estimated_cost_usd"],
                                "rag_used": bool(rag_context),
                                "source": "web",
                                "booking_stage": booking_state.stage.value if booking_state else None,
                                "widget_type": (widget or {}).get("widget_type"),
                            },
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
                    if web_client_id:
                        try:
                            await get_client_service().increment_counters(web_client_id, messages=1)
                        except Exception:
                            pass

                    payload = {"type": "message", "role": "assistant", "content": outgoing_message}
                    if widget:
                        payload["metadata"] = widget
                    elif started_booking is None:
                        payload["metadata"] = {"tokens_used": response["tokens_used"], "model": response["model"]}
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
    claude = get_llm_service()
    rag = get_rag_service()

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

    # === Fase 2: Inicializar flujo de captura si está configurado ===
    # Si el bot tiene ius_config cargado, ese JSON es el guión completo de la
    # conversación y tiene prioridad: el flujo fijo de captura no debe
    # interceptar los mensajes (si no, build_effective_system_prompt nunca
    # se llega a usar).
    flow_state: Optional[FlowState] = None
    if (
        not bot.config.ius_config
        and bot.config.flow
        and bot.config.flow.enabled
        and bot.config.flow.steps
        and await get_module_service().is_enabled(bot.bot_id, "lead_funnel")
    ):
        # Obtener datos existentes del cliente para saltar pasos ya completados
        existing_data = None
        if channel_client_id:
            try:
                client = await get_client_service().get_client(channel_client_id)
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
            client_id=channel_client_id,
            existing_client_data=existing_data,
        )

        # Enviar primera pregunta del flujo si no está completo
        if not flow_state.is_complete:
            first_question = flow_state.get_current_question()
            if first_question:
                await websocket.send_json(
                    {"type": "message", "role": "assistant", "content": first_question}
                )

    # Reserva de turnos por chat (ver appointment_booking_service.py): estado
    # de la mini-conversación de booking para esta sesión, si hay una activa.
    booking_state: Optional[BookingState] = None

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
                # === Reserva de turnos: si hay una mini-conversación de booking
                # en curso para esta sesión, tiene prioridad sobre flow y RAG.
                # booking_result queda en None salvo en las dos ramas de booking
                # (ver el envío unificado más abajo, después de este if/elif) ===
                booking_result: Optional[dict] = None

                if booking_state is not None:
                    booking_result = await booking_state.process_answer(user_text)

                # === Fase 2: Procesar respuesta del flujo si está activo ===
                elif flow_state and not flow_state.is_complete:
                    result = flow_state.process_answer(user_text)

                    # Registrar en conversación -- nunca debe impedir que la
                    # respuesta real le llegue al usuario más abajo.
                    try:
                        await conv_service.log_chat_interaction(
                            user_id=session_id,
                            user_message=user_text,
                            assistant_response=result.get("next_question") or bot.config.flow.completion_message,
                            metadata={"source": channel_source, "channel_id": channel_id, "flow_field": result.get("captured_field")},
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

                    if not result["valid"]:
                        # Respuesta inválida: repetir la pregunta con el hint
                        error_msg = result.get("error", "Por favor, inténtalo de nuevo.")
                        await websocket.send_json(
                            {"type": "message", "role": "assistant", "content": error_msg}
                        )
                    elif result["is_complete"]:
                        # Flujo completado: actualizar cliente y continuar a RAG
                        raw_update = flow_state.get_client_update_data()
                        if channel_client_id and raw_update:
                            try:
                                score_bonus = flow_state.get_lead_score_bonus()
                                client_update = ClientUpdate(
                                    name=raw_update.get("name"),
                                    email=raw_update.get("email"),
                                    phone=raw_update.get("phone"),
                                    dni=raw_update.get("dni"),
                                    metadata=raw_update.get("metadata"),
                                )
                                await get_client_service().update_client(
                                    channel_client_id, client_update
                                )
                                # Incrementar score con la bonificación del tipo de caso
                                if score_bonus > 0:
                                    await get_client_service().increment_counters(
                                        channel_client_id, messages=int(score_bonus * 10)
                                    )
                            except Exception:
                                pass

                        await websocket.send_json(
                            {"type": "message", "role": "assistant", "content": bot.config.flow.completion_message}
                        )
                    else:
                        # Siguiente pregunta del flujo
                        next_q = result.get("next_question")
                        if next_q:
                            await websocket.send_json(
                                {"type": "message", "role": "assistant", "content": next_q}
                            )
                else:
                    # === Flujo completado o no configurado: LLM (con tools de
                    # calificación por semáforo y/o inicio de reserva de turnos,
                    # si el bot los tiene habilitados — ver _build_llm_tools) ===
                    rag_context: Optional[str] = None
                    if bot.config.use_rag:
                        rag_context = rag.get_context(
                            user_text, bot_id=channel.bot_id, n_results=bot.config.rag_results_count
                        )

                    tools, tool_dispatch, booking_output = await _build_llm_tools(
                        bot, channel_client, channel_client_id, channel_source
                    )

                    response = await asyncio.to_thread(
                        _sync_generate,
                        claude,
                        user_text,
                        rag_context,
                        build_effective_system_prompt(bot.config),
                        conversation_history,
                        bot.config.max_tokens,
                        bot.config.llm_thinking or None,
                        tools,
                        tool_dispatch,
                    )

                    conversation_history.append(ChatMessage(role="user", content=user_text))
                    conversation_history.append(
                        ChatMessage(role="assistant", content=response["response"])
                    )

                    # Si el LLM invocó la tool de inicio de reserva, lo que se le
                    # muestra al usuario es el mensaje/widget del booking
                    # (calendario), no la narración de texto de Claude.
                    started_booking = booking_output.get("result")
                    if started_booking is not None:
                        booking_state = booking_output.get("state")
                        outgoing_message = started_booking["message"]
                        widget = started_booking.get("widget")
                    else:
                        outgoing_message = response["response"]
                        widget = None

                    # Nunca debe impedir que la respuesta real (ya generada por el
                    # LLM) le llegue al usuario más abajo -- ver bug: un
                    # conversation_id no encontrado en este log dejaba la
                    # respuesta real sin enviar y el chat parecía "colgado".
                    try:
                        await conv_service.log_chat_interaction(
                            user_id=session_id,
                            user_message=user_text,
                            assistant_response=outgoing_message,
                            metadata={
                                "model": response["model"],
                                "tokens_used": response["tokens_used"],
                                "input_tokens": response["input_tokens"],
                                "output_tokens": response["output_tokens"],
                                "estimated_cost_usd": response["estimated_cost_usd"],
                                "rag_used": bool(rag_context),
                                "source": channel_source,
                                "channel_id": channel_id,
                                "booking_stage": booking_state.stage.value if booking_state else None,
                                "widget_type": (widget or {}).get("widget_type"),
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

                    # Actualizar contadores del cliente
                    if channel_client_id:
                        try:
                            await get_client_service().increment_counters(channel_client_id, messages=1)
                        except Exception:
                            pass

                    await channel_service.increment_message_counters(channel_id, received=1, sent=1)

                    payload = {"type": "message", "role": "assistant", "content": outgoing_message}
                    if widget:
                        payload["metadata"] = widget
                    elif started_booking is None:
                        payload["metadata"] = {"tokens_used": response["tokens_used"], "model": response["model"]}
                    await websocket.send_json(payload)

                # === Envío unificado para las dos ramas de booking de arriba
                # (booking_state activo o recién arrancado por start_booking) ===
                if booking_result is not None:
                    try:
                        await conv_service.log_chat_interaction(
                            user_id=session_id,
                            user_message=user_text,
                            assistant_response=booking_result["message"],
                            metadata={
                                "source": channel_source,
                                "channel_id": channel_id,
                                "booking_stage": booking_state.stage.value if booking_state else None,
                                "widget_type": (booking_result.get("widget") or {}).get("widget_type"),
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

                    payload = {"type": "message", "role": "assistant", "content": booking_result["message"]}
                    if booking_result.get("widget"):
                        payload["metadata"] = booking_result["widget"]
                    await websocket.send_json(payload)

                    if booking_result["done"] or booking_result["cancelled"]:
                        booking_state = None

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


def _sync_generate(
    llm,
    user_message: str,
    context: Optional[str],
    system_prompt: str,
    history: List[ChatMessage],
    max_tokens: int,
    thinking: Optional[bool] = None,
    tools: Optional[list] = None,
    tool_executor=None,
) -> dict:
    """Wrapper síncrono para llamar al LLM activo desde asyncio.to_thread."""
    messages = [{"role": m.role, "content": m.content} for m in history]
    messages.append({"role": "user", "content": user_message})

    full_system_prompt = system_prompt
    if context:
        full_system_prompt += f"\n\nCONTEXTO RELEVANTE:\n{context}"

    return llm.sync_generate(full_system_prompt, messages, max_tokens, thinking, tools, tool_executor)
