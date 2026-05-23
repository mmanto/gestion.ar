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
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from fastapi.responses import Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.auth_service import get_current_user_from_token, User
from app.claude_service import get_llm_service, ChatMessage, build_effective_system_prompt, get_effective_welcome_message
from app.connection_manager import connection_manager
from app.conversation_service import get_conversation_service
from app.rag_service import get_rag_service
from app.services.bot_service import get_bot_service
from app.services.channel_service import get_channel_service
from app.services.client_service import get_client_service
from app.services.conversation_flow_service import create_flow_state, FlowState
from app.models.client import ClientUpdate

logger = logging.getLogger(__name__)

router = APIRouter(tags=["web-chat"])

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> User:
    """Dependency: extrae el usuario actual del JWT"""
    token = credentials.credentials
    user = get_current_user_from_token(token)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


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
    bot = await bot_service.get_bot_by_owner(bot_id, current_user.username)
    if not bot:
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
    Cada conexión crea una conversación nueva en MongoDB (channel='web').
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

    # Usar device_id estable del cliente si lo envía, o generar uno nuevo
    session_id = device_id if device_id else str(uuid.uuid4())
    web_client_id: Optional[str] = None
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
        }
    )

    # Registrar conexión activa para mensajes de agente
    connection_manager.register(conversation_id, websocket)

    # Pre-cargar el welcome como primer turno del asistente para que Claude no lo repita
    conversation_history: List[ChatMessage] = [
        ChatMessage(role="assistant", content=get_effective_welcome_message(bot.config))
    ]

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

            # Indicar que el bot está "escribiendo"
            await websocket.send_json({"type": "typing", "status": True})

            try:
                # Obtener contexto RAG si está habilitado
                rag_context: Optional[str] = None
                if bot.config.use_rag:
                    rag_context = rag.get_context(
                        user_text, n_results=bot.config.rag_results_count
                    )

                # Llamar a Claude (es síncrono internamente; lo ejecutamos en un thread)
                response = await asyncio.to_thread(
                    _sync_generate,
                    claude,
                    user_text,
                    rag_context,
                    build_effective_system_prompt(bot.config),
                    conversation_history,
                    bot.config.max_tokens,
                )

                # Actualizar historial en memoria
                conversation_history.append(ChatMessage(role="user", content=user_text))
                conversation_history.append(
                    ChatMessage(role="assistant", content=response["response"])
                )

                # Persistir en MongoDB — reutilizando la misma conversación
                await conv_service.log_chat_interaction(
                    user_id=session_id,
                    user_message=user_text,
                    assistant_response=response["response"],
                    metadata={
                        "model": response["model"],
                        "tokens_used": response["tokens_used"],
                        "input_tokens": response["input_tokens"],
                        "output_tokens": response["output_tokens"],
                        "estimated_cost_usd": response["estimated_cost_usd"],
                        "rag_used": bool(rag_context),
                        "source": "web",
                    },
                    conversation_id=conversation_id,
                    bot_id=bot_id,
                    client_id=web_client_id,
                    channel="web",
                )

                # Actualizar contadores del cliente
                if web_client_id:
                    try:
                        await get_client_service().increment_counters(web_client_id, messages=1)
                    except Exception:
                        pass

                await websocket.send_json(
                    {
                        "type": "message",
                        "role": "assistant",
                        "content": response["response"],
                        "metadata": {
                            "tokens_used": response["tokens_used"],
                            "model": response["model"],
                        },
                    }
                )

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

    # Actualizar contador de actividad del canal
    await channel_service.increment_message_counters(channel_id, received=0, sent=0)

    # Determinar la fuente según el tipo de canal
    channel_source = "pwa" if channel.channel_type == "pwa" else "web"

    # Usar device_id estable del cliente si lo envía, o generar uno nuevo
    session_id = device_id if device_id else str(uuid.uuid4())
    channel_client_id: Optional[str] = None
    try:
        client_service = get_client_service()
        channel_client = await client_service.get_or_create_client(
            bot_id=channel.bot_id,
            external_id=session_id,
            source=channel_source,
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
    flow_state: Optional[FlowState] = None
    if bot.config.flow and bot.config.flow.enabled and bot.config.flow.steps:
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

            await websocket.send_json({"type": "typing", "status": True})

            try:
                # === Fase 2: Procesar respuesta del flujo si está activo ===
                if flow_state and not flow_state.is_complete:
                    result = flow_state.process_answer(user_text)

                    # Registrar en conversación
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
                    # === Flujo completado o no configurado: chat RAG normal ===
                    rag_context: Optional[str] = None
                    if bot.config.use_rag:
                        rag_context = rag.get_context(
                            user_text, n_results=bot.config.rag_results_count
                        )

                    response = await asyncio.to_thread(
                        _sync_generate,
                        claude,
                        user_text,
                        rag_context,
                        build_effective_system_prompt(bot.config),
                        conversation_history,
                        bot.config.max_tokens,
                    )

                    conversation_history.append(ChatMessage(role="user", content=user_text))
                    conversation_history.append(
                        ChatMessage(role="assistant", content=response["response"])
                    )

                    await conv_service.log_chat_interaction(
                        user_id=session_id,
                        user_message=user_text,
                        assistant_response=response["response"],
                        metadata={
                            "model": response["model"],
                            "tokens_used": response["tokens_used"],
                            "input_tokens": response["input_tokens"],
                            "output_tokens": response["output_tokens"],
                            "estimated_cost_usd": response["estimated_cost_usd"],
                            "rag_used": bool(rag_context),
                            "source": channel_source,
                            "channel_id": channel_id,
                        },
                        conversation_id=conversation_id,
                        bot_id=channel.bot_id,
                        client_id=channel_client_id,
                        channel=channel_source,
                    )

                    # Actualizar contadores del cliente
                    if channel_client_id:
                        try:
                            await get_client_service().increment_counters(channel_client_id, messages=1)
                        except Exception:
                            pass

                    await channel_service.increment_message_counters(channel_id, received=1, sent=1)

                    await websocket.send_json(
                        {
                            "type": "message",
                            "role": "assistant",
                            "content": response["response"],
                            "metadata": {
                                "tokens_used": response["tokens_used"],
                                "model": response["model"],
                            },
                        }
                    )

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
) -> dict:
    """Wrapper síncrono para llamar al LLM activo desde asyncio.to_thread."""
    messages = [{"role": m.role, "content": m.content} for m in history]
    messages.append({"role": "user", "content": user_message})

    full_system_prompt = system_prompt
    if context:
        full_system_prompt += f"\n\nCONTEXTO RELEVANTE:\n{context}"

    return llm.sync_generate(full_system_prompt, messages, max_tokens)
