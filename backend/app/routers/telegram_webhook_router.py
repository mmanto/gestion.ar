"""
Telegram Webhook Router
Handles Telegram webhooks per channel (POST /api/webhook/telegram/{channel_id})
"""

import json
import logging
from typing import Optional, Dict, Any

from fastapi import APIRouter, Request, HTTPException, Header

from app.services.channel_service import get_channel_service
from app.services.client_service import get_client_service
from app.models.channel import ChannelType, ChannelStatus
from app.telegram_service import create_telegram_service
from app.telegram_handlers import (
    handle_telegram_command,
    handle_telegram_text_message,
    handle_telegram_document,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhook/telegram", tags=["Telegram Webhooks"])


@router.post("/{channel_id}")
async def handle_telegram_channel_webhook(
    channel_id: str,
    request: Request,
    x_telegram_bot_api_secret_token: Optional[str] = Header(
        None, alias="X-Telegram-Bot-Api-Secret-Token"
    ),
):
    """
    Webhook endpoint for Telegram updates routed by channel_id.

    Flow:
    1. Look up channel in MongoDB
    2. Validate type=TELEGRAM and status=ACTIVE
    3. Create TelegramService with channel credentials
    4. Verify secret token header
    5. Parse, deduplicate, rate-limit
    6. Dispatch to handler (command/text/document)
    7. Increment message counters
    """
    try:
        # 1. Look up channel
        channel_service = get_channel_service()
        channel = await channel_service.get_channel(channel_id)

        if not channel:
            raise HTTPException(404, f"Canal no encontrado: {channel_id}")

        # 2. Validate channel type and status
        if channel.channel_type != ChannelType.TELEGRAM:
            raise HTTPException(400, "Canal no es de tipo Telegram")

        if channel.status != ChannelStatus.ACTIVE:
            raise HTTPException(403, f"Canal no está activo (status: {channel.status})")

        if not channel.telegram_config:
            raise HTTPException(400, "Canal sin configuración de Telegram")

        # 3. Create TelegramService with channel credentials
        telegram = create_telegram_service(
            bot_token=channel.telegram_config.bot_token,
            webhook_secret=channel.telegram_config.webhook_secret,
        )

        # 4. Verify secret token
        if not telegram.verify_webhook(x_telegram_bot_api_secret_token):
            raise HTTPException(403, "Invalid secret token")

        # 5. Parse JSON body
        body = await request.body()
        update_data = json.loads(body.decode())

        logger.info(f"Telegram update received for channel {channel_id}")

        # Parse message
        message_data = telegram.parse_message(update_data)

        if not message_data:
            return {"status": "ok", "message": "Not a message update"}

        # Registrar o recuperar cliente
        if channel.bot_id:
            try:
                client_service = get_client_service()
                client = await client_service.get_or_create_client(
                    bot_id=channel.bot_id,
                    external_id=str(message_data["user_id"]),
                    source="telegram",
                    metadata={"first_name": message_data.get("first_name")},
                )
                message_data["client_id"] = client.client_id
                message_data["bot_id"] = channel.bot_id
            except Exception as e:
                logger.warning(f"Error registrando cliente Telegram: {e}")

        # Check for duplicate (idempotency)
        if telegram.is_duplicate_message(message_data["update_id"]):
            return {"status": "ok", "message": "Duplicate update, already processed"}

        # Check rate limit
        if telegram.check_rate_limit(message_data["chat_id"]):
            await telegram.send_message(
                chat_id=message_data["chat_id"],
                text="⚠️ Has excedido el límite de mensajes. Por favor, espera un momento.",
            )
            return {"status": "ok", "message": "Rate limit exceeded"}

        # 6. Dispatch to handler
        result: Dict[str, Any] = {"status": "ok", "message": "Unsupported message type"}

        if message_data["type"] == "command":
            result = await handle_telegram_command(telegram, message_data)
        elif message_data["type"] == "text":
            result = await handle_telegram_text_message(telegram, message_data)
        elif message_data["type"] == "document":
            result = await handle_telegram_document(telegram, message_data)
        else:
            await telegram.send_message(
                chat_id=message_data["chat_id"],
                text="⚠️ Por el momento solo puedo procesar mensajes de texto y documentos (PDF/DOCX).",
            )

        # 7. Increment message counters
        try:
            await channel_service.increment_message_counters(
                channel_id, received=1, sent=1
            )
        except Exception as e:
            logger.warning(f"Error updating counters for channel {channel_id}: {e}")

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing Telegram webhook for channel {channel_id}: {e}")
        raise HTTPException(500, f"Error processing webhook: {str(e)}")
