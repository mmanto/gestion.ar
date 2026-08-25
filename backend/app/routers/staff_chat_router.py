"""
Staff Chat Router — WebSocket para admins/operadores
(ver ADR-007 en docs/dev/DECISIONS.md).

Permite que el staff reciba mensajes de clientes en tiempo real
y responda como agente desde la app mobile/staff.
"""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.auth_service import get_current_user_from_token
from app.connection_manager import connection_manager, staff_connection_manager
from app.services.bot_service import get_bot_service
from app.services.client_service import get_client_service
from app.services.user_service import get_user_service
from app.conversation_service import get_conversation_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["staff-chat"])


@router.websocket("/ws/staff/chat/{bot_id}")
async def staff_chat_websocket(
    websocket: WebSocket,
    bot_id: str,
    token: str = Query(...),
):
    """
    WebSocket para staff (admins/operadores) que monitorean un bot.

    Autenticación: JWT via query param `?token=eyJ...`

    Eventos recibidos (staff → servidor):
      {"type": "agent_message", "conversation_id": "...", "content": "..."}
      {"type": "agent_typing", "conversation_id": "..."}

    Eventos enviados (servidor → staff):
      {"type": "client_message", "conversation_id": "...", "client_id": "...",
       "client_name": "...", "channel": "...", "content": "...", "timestamp": "..."}
      {"type": "client_connected", "client_id": "...", "client_name": "...", "channel": "..."}
      {"type": "client_typing", "conversation_id": "...", "client_id": "..."}
    """
    # Autenticar
    user = await get_current_user_from_token(token)
    if user is None:
        await websocket.accept()
        await websocket.send_json({"type": "error", "message": "Token inválido o expirado"})
        await websocket.close(code=4001)
        return

    # Verificar que el bot exista y pertenezca al tenant del usuario
    bot_service = get_bot_service()
    bot = await bot_service.get_bot(bot_id)
    if not bot:
        await websocket.accept()
        await websocket.send_json({"type": "error", "message": "Bot no encontrado"})
        await websocket.close(code=4004)
        return
    if bot.tenant_id != user.tenant_id:
        await websocket.accept()
        await websocket.send_json({"type": "error", "message": "No tenés acceso a este bot"})
        await websocket.close(code=4003)
        return

    await websocket.accept()

    # Registrar conexión de staff
    staff_connection_manager.register(bot_id, user.username, websocket)
    logger.info("Staff conectado: user=%s bot=%s", user.username, bot_id)

    await websocket.send_json({
        "type": "connected",
        "bot_id": bot_id,
        "bot_name": bot.name,
        "user": user.username,
    })

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "JSON inválido"})
                continue

            msg_type = data.get("type")
            conversation_id = data.get("conversation_id")

            if msg_type == "agent_message" and conversation_id:
                content = data.get("content", "").strip()
                if not content:
                    continue

                conv_service = get_conversation_service()
                owner_usernames = await get_user_service().get_scoped_owner_usernames(user)
                if owner_usernames is not None:
                    conversation = await conv_service.get_conversation(conversation_id)
                    conv_client_id = conversation.get("client_id") if conversation else None
                    conv_client = await get_client_service().get_client(conv_client_id) if conv_client_id else None
                                        # Cliente sin owner (canal general/legacy): cualquier
                    # staff del tenant puede responder — ver
                    # owner_scope_clause en user_service.py.
                    if conv_client and conv_client.owner_username is not None and conv_client.owner_username not in owner_usernames:
                        await websocket.send_json({
                            "type": "error",
                            "message": "Conversación no encontrada",
                            "conversation_id": conversation_id,
                        })
                        continue
                try:
                    msg = await conv_service.add_message(
                        conversation_id=conversation_id,
                        role="assistant",
                        content=content,
                        metadata={"source": "agent", "agent_username": user.username},
                    )
                except ValueError:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Conversación no encontrada",
                        "conversation_id": conversation_id,
                    })
                    continue

                # Enviar al cliente vía WebSocket si está conectado
                await connection_manager.send_to_conversation(
                    conversation_id,
                    {
                        "type": "message",
                        "role": "assistant",
                        "content": content,
                        "metadata": {"source": "agent", "agent_name": user.username},
                    },
                )

                # Confirmar al staff
                await websocket.send_json({
                    "type": "agent_message_sent",
                    "conversation_id": conversation_id,
                    "message_id": msg.get("message_id") if isinstance(msg, dict) else None,
                })

            elif msg_type == "agent_typing" and conversation_id:
                # Forward typing indicator al cliente
                await connection_manager.send_to_conversation(
                    conversation_id,
                    {
                        "type": "typing",
                        "status": True,
                        "source": "agent",
                    },
                )

    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("Error en staff WebSocket (user=%s bot=%s)", user.username, bot_id)
    finally:
        staff_connection_manager.unregister(bot_id, user.username)
        logger.info("Staff desconectado: user=%s bot=%s", user.username, bot_id)
