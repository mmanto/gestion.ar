"""
Voice Router - canal de voz Deepgram (proxy server-side) y bootstrap por API key.

Dos superficies:

- Público por `channel_id` (PWA/QR): `GET /api/voice/channels/{id}/config` y
  `WS /ws/voice/channel/{id}`. Es el mismo modelo de capacidad que el chat web
  (el `channel_id` se entrega en el QR).
- Bootstrap por **API key de tenant** (APK): `POST /api/public/voice/session`
  con `Authorization: Bearer tk_live_…` resuelve tenant → canal de voz y
  devuelve un `ticket` efímero para abrir el WS. Así la key nunca viaja en la
  URL del WebSocket.

La key de Deepgram, el prompt y las tools viven en el backend; el cliente solo
transporta PCM (ver ADR-034/ADR-035).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import traceback
import uuid
from typing import Optional

import websockets
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel, Field

from app.auth_service import ALGORITHM, SECRET_KEY
from app.claude_service import get_effective_welcome_message
from app.connection_manager import notify_staff_of_client_message
from app.conversation_service import get_conversation_service
from app.models.channel import Channel, ChannelStatus, ChannelType
from app.models.tenant import Tenant
from app.services.bot_service import get_bot_service
from app.services.channel_service import get_channel_service
from app.services.client_service import get_client_service
from app.services.tenant_service import get_tenant_service
from app.services.voice_session_service import (
    DEEPGRAM_WS_URL,
    VoiceConfigError,
    build_voice_functions,
    build_voice_settings,
    execute_function,
    history_messages,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["voice"])

_bearer = HTTPBearer(auto_error=False)
TICKET_PURPOSE = "voice_ws"
TICKET_TTL_SECONDS = 60

DEFAULT_COST_PER_MINUTE = 0.075


class VoiceSessionRequest(BaseModel):
    device_id: Optional[str] = Field(None, max_length=200)
    channel_id: Optional[str] = Field(None, description="Solo si el tenant tiene más de un canal de voz")


# ── API key de tenant ────────────────────────────────────────────────────────

async def _tenant_from_key(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> Tenant:
    """Resuelve el tenant activo por `Authorization: Bearer tk_live_…`."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key requerida",
            headers={"WWW-Authenticate": "Bearer"},
        )
    tenant = await get_tenant_service().get_tenant_by_api_key(credentials.credentials)
    if tenant is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key inválida o tenant inactivo",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return tenant


async def _resolve_voice_channel(tenant: Tenant, channel_id: Optional[str]) -> Channel:
    """Canal de voz activo del tenant; `channel_id` solo desambigua.

    Nunca se confía en un `channel_id` de otro tenant: se valida la
    pertenencia antes de devolverlo.
    """
    channel_service = get_channel_service()

    if channel_id:
        channel = await channel_service.get_channel(channel_id)
        if not channel or channel.tenant_id != tenant.tenant_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Canal no encontrado")
        if channel.channel_type != ChannelType.VOICE:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "El canal no es de tipo voice")
        if channel.status != ChannelStatus.ACTIVE:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "El canal no está activo")
        return channel

    channels = await channel_service.get_active_voice_channels_by_tenant(tenant.tenant_id)
    if not channels:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "El tenant no tiene un canal de voz activo",
        )
    if len(channels) > 1:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "El tenant tiene varios canales de voz; especificá channel_id",
        )
    return channels[0]


def _issue_ticket(tenant: Tenant, channel: Channel, device_id: str) -> str:
    """JWT corto, firmado con el secreto de la app. No sirve como sesión de usuario."""
    now = int(time.time())
    return jwt.encode(
        {
            "sub": tenant.tenant_id,
            "channel_id": channel.channel_id,
            "bot_id": channel.bot_id,
            "device_id": device_id,
            "purpose": TICKET_PURPOSE,
            "jti": uuid.uuid4().hex,
            "iat": now,
            "exp": now + TICKET_TTL_SECONDS,
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


async def _channel_from_ticket(ticket: str, channel_id: str) -> Channel:
    try:
        claims = jwt.decode(ticket, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Ticket inválido o expirado")
    if claims.get("purpose") != TICKET_PURPOSE or claims.get("channel_id") != channel_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Ticket inválido para este canal")

    channel_service = get_channel_service()
    channel = await channel_service.get_channel(claims["channel_id"])
    tenant = await get_tenant_service().get_tenant(claims.get("sub", ""))
    if not channel or not tenant or channel.tenant_id != tenant.tenant_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Ticket inválido para este canal")
    if tenant.status != "active" or channel.status != ChannelStatus.ACTIVE:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Canal o tenant inactivo")
    return channel


# ── HTTP: bootstrap del cliente ──────────────────────────────────────────────

async def _bootstrap_payload(tenant: Tenant, channel: Channel, device_id: Optional[str]) -> dict:
    bot = await get_bot_service().get_bot(channel.bot_id)
    if not bot:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bot no encontrado")

    device_id = device_id or str(uuid.uuid4())
    return {
        "tenant": {"tenant_id": tenant.tenant_id, "name": tenant.name},
        "bot": {"bot_id": bot.bot_id, "name": bot.name},
        "channel": {"channel_id": channel.channel_id},
        "greeting": get_effective_welcome_message(bot.config),
        "ws_path": f"/ws/voice/channel/{channel.channel_id}",
        "device_id": device_id,
        "ticket": _issue_ticket(tenant, channel, device_id),
        "ticket_ttl": TICKET_TTL_SECONDS,
    }


@router.get("/api/public/voice/config")
async def get_voice_config(
    channel_id: Optional[str] = Query(None),
    tenant: Tenant = Depends(_tenant_from_key),
):
    """Marca/nombre del tenant y su canal de voz, sin abrir sesión."""
    channel = await _resolve_voice_channel(tenant, channel_id)
    bot = await get_bot_service().get_bot(channel.bot_id)
    if not bot:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bot no encontrado")
    return {
        "tenant": {"tenant_id": tenant.tenant_id, "name": tenant.name},
        "bot": {"bot_id": bot.bot_id, "name": bot.name},
        "channel": {"channel_id": channel.channel_id},
        "greeting": get_effective_welcome_message(bot.config),
        "ws_path": f"/ws/voice/channel/{channel.channel_id}",
    }


@router.post("/api/public/voice/session")
async def create_voice_session(
    data: VoiceSessionRequest,
    tenant: Tenant = Depends(_tenant_from_key),
):
    """Resuelve tenant → canal y devuelve el ticket para el WebSocket."""
    channel = await _resolve_voice_channel(tenant, data.channel_id)
    return await _bootstrap_payload(tenant, channel, data.device_id)


@router.get("/api/voice/channels/{channel_id}/config")
async def get_public_voice_channel_config(channel_id: str):
    """Config pública del canal de voz (misma información que el QR web)."""
    channel = await get_channel_service().get_channel(channel_id)
    if not channel:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Canal no encontrado")
    if channel.channel_type != ChannelType.VOICE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El canal no es de tipo voice")
    if channel.status != ChannelStatus.ACTIVE:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Canal no disponible")

    bot = await get_bot_service().get_bot(channel.bot_id)
    if not bot:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bot no encontrado")
    return {
        "channel_id": channel.channel_id,
        "channel_type": channel.channel_type,
        "bot": {"bot_id": bot.bot_id, "name": bot.name},
        "voice_model": channel.voice_config.voice_model if channel.voice_config else None,
        "greeting": get_effective_welcome_message(bot.config),
        "ws_path": f"/ws/voice/channel/{channel.channel_id}",
    }


# ── WebSocket: puente cliente ↔ Deepgram ─────────────────────────────────────

async def _resolve_ws_target(
    websocket: WebSocket, channel_id: str
) -> Optional[Channel]:
    """Canal del WS: por ticket (APK) o abierto por channel_id (PWA).

    Devuelve None si ya se respondió/cerró con el error correspondiente.
    """
    ticket = websocket.query_params.get("ticket")
    try:
        if ticket:
            return await _channel_from_ticket(ticket, channel_id)
        channel = await get_channel_service().get_channel(channel_id)
    except HTTPException as exc:
        await websocket.send_json({"type": "error", "message": exc.detail})
        await websocket.close(code=4401 if exc.status_code == 401 else 4403)
        return None

    if not channel:
        await websocket.send_json({"type": "error", "message": "Canal no encontrado"})
        await websocket.close(code=4004)
        return None
    if channel.channel_type != ChannelType.VOICE:
        await websocket.send_json({"type": "error", "message": "El canal no es de tipo voice"})
        await websocket.close(code=4004)
        return None
    if channel.status != ChannelStatus.ACTIVE:
        await websocket.send_json({"type": "error", "message": "El canal no está activo"})
        await websocket.close(code=4403)
        return None
    return channel


@router.websocket("/ws/voice/channel/{channel_id}")
async def voice_websocket(
    websocket: WebSocket,
    channel_id: str,
    device_id: Optional[str] = Query(None),
):
    await websocket.accept()

    channel = await _resolve_ws_target(websocket, channel_id)
    if channel is None:
        return

    bot = await get_bot_service().get_bot(channel.bot_id)
    if not bot:
        await websocket.send_json({"type": "error", "message": "Bot no encontrado"})
        await websocket.close(code=4004)
        return

    tenant = await get_tenant_service().get_tenant(channel.tenant_id)
    if not tenant:
        await websocket.send_json({"type": "error", "message": "Tenant no encontrado"})
        await websocket.close(code=4004)
        return

    conv_service = get_conversation_service()
    client_service = get_client_service()
    session_id = device_id or str(uuid.uuid4())

    # El historial se lee ANTES de crear la conversación nueva (si no, se lee
    # a sí misma y duplica el último turno).
    history = history_messages(
        await conv_service.get_latest_conversation_by_user(
            session_id, bot.bot_id, channel.channel_id
        )
    )

    channel_client = await client_service.get_or_create_client(
        bot_id=bot.bot_id,
        external_id=session_id,
        source="voice",
        channel_id=channel.channel_id,
    )
    conversation_id = await conv_service.create_conversation(
        user_id=session_id,
        bot_id=bot.bot_id,
        client_id=channel_client.client_id,
        channel="voice",
        metadata={
            "source": "voice",
            "channel_id": channel.channel_id,
            "device_id": session_id,
        },
    )
    greeting = get_effective_welcome_message(bot.config)

    try:
        functions, dispatch = await build_voice_functions(
            bot, channel_client, channel_client.client_id
        )
        settings = build_voice_settings(bot, channel, history, functions)
    except VoiceConfigError as exc:
        await websocket.send_json({"type": "error", "message": str(exc)})
        await websocket.close(code=1011)
        return

    api_key = os.getenv("DEEPGRAM_API_KEY", "").strip()
    if not api_key:
        await websocket.send_json(
            {"type": "error", "message": "Falta DEEPGRAM_API_KEY en el servidor"}
        )
        await websocket.close(code=1011)
        return

    await websocket.send_json(
        {
            "type": "meta",
            "conversation_id": conversation_id,
            "bot_name": bot.name,
            "tenant_name": tenant.name,
            "greeting": greeting,
        }
    )

    try:
        async with websockets.connect(
            DEEPGRAM_WS_URL,
            additional_headers={"Authorization": f"Token {api_key}"},
            max_size=None,
        ) as dg:
            await _bridge(websocket, dg, settings, dispatch, conv_service, channel_client, conversation_id)
    except WebSocketDisconnect:
        return
    except Exception:
        logger.error("Error en el canal de voz:\n%s", traceback.format_exc())
        try:
            await websocket.send_json(
                {"type": "error", "message": "Se cortó la conexión con el agente de voz"}
            )
        except Exception:
            pass
    finally:
        # Si Deepgram cierra (o falla), el cliente no debe quedar con un socket
        # mudo: se cierra para que la app reconecte y pida un ticket nuevo.
        try:
            await websocket.close(code=1011)
        except Exception:
            pass


async def _bridge(
    websocket: WebSocket,
    dg,
    settings: dict,
    dispatch,
    conv_service,
    channel_client,
    conversation_id: str,
) -> None:
    """Reenvía audio/frames en ambos sentidos y ejecuta las tools in-process."""
    last_user_turn = time.monotonic()
    cost_per_minute = float(
        os.getenv("VOICE_COST_PER_MINUTE_USD", str(DEFAULT_COST_PER_MINUTE))
    )

    async def dg_to_client() -> None:
        nonlocal last_user_turn
        async for message in dg:
            if isinstance(message, bytes):
                await websocket.send_bytes(message)
                continue

            try:
                data = json.loads(message)
            except json.JSONDecodeError:
                continue

            kind = data.get("type")
            if kind == "Welcome":
                # El agente solo acepta Settings después del Welcome.
                await dg.send(json.dumps(settings))
                continue

            if kind == "FunctionCallRequest":
                for function in data.get("functions") or []:
                    if not function.get("client_side"):
                        continue
                    try:
                        args = json.loads(function.get("arguments") or "{}")
                    except json.JSONDecodeError:
                        args = {}
                    content = await execute_function(dispatch, function.get("name", ""), args)
                    await dg.send(
                        json.dumps(
                            {
                                "type": "FunctionCallResponse",
                                "id": function.get("id"),
                                "name": function.get("name"),
                                "content": content,
                            }
                        )
                    )
                continue

            if kind == "ConversationText":
                role = data.get("role")
                content = (data.get("content") or "").strip()
                if content and role == "user":
                    last_user_turn = time.monotonic()
                    await conv_service.add_message(
                        conversation_id, "user", content, {"source": "voice"}
                    )
                    await notify_staff_of_client_message(
                        bot_id=channel_client.bot_id,
                        conversation_id=conversation_id,
                        client_id=channel_client.client_id,
                        client_label=channel_client.name or channel_client.client_id[:8],
                        content=content,
                        channel="voice",
                    )
                    await get_client_service().increment_counters(
                        channel_client.client_id, messages=1
                    )
                elif content and role == "assistant":
                    elapsed_minutes = (time.monotonic() - last_user_turn) / 60
                    await conv_service.add_message(
                        conversation_id,
                        "assistant",
                        content,
                        {
                            "source": "voice",
                            "estimated_cost_usd": round(elapsed_minutes * cost_per_minute, 6),
                        },
                    )
            elif kind in ("Error", "Warning"):
                logger.warning(
                    "Deepgram %s: %s", kind, data.get("description") or data.get("message")
                )

            await websocket.send_json(data)

    async def client_to_dg() -> None:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                raise WebSocketDisconnect(message.get("code", 1000))

            if message.get("bytes") is not None:
                await dg.send(message["bytes"])
                continue

            text = message.get("text")
            if not text:
                continue
            try:
                data = json.loads(text)
            except json.JSONDecodeError:
                continue

            kind = data.get("type")
            if kind == "text":
                await dg.send(json.dumps({"type": "InjectUserMessage", "content": data.get("content", "")}))
            elif kind in ("Settings", "UpdateThink", "UpdatePrompt", "UpdateSpeak"):
                # El servidor es dueño de la configuración: se ignora.
                continue
            else:
                await dg.send(text)

    tasks = [asyncio.create_task(dg_to_client()), asyncio.create_task(client_to_dg())]
    try:
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        for task in done:
            task.result()
    finally:
        for task in tasks:
            task.cancel()
        try:
            await dg.close()
        except Exception:
            pass
