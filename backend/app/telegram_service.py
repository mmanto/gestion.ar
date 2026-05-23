"""
Telegram Bot API Service
Handles webhook verification, message receiving/sending, and document processing
"""

import os
import logging
from typing import Optional, Dict, Any
import httpx
import redis
from fastapi import HTTPException

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TelegramService:
    """Service to interact with Telegram Bot API"""

    def __init__(self, bot_token: Optional[str] = None, webhook_secret: Optional[str] = None):
        """Initialize Telegram service

        Args:
            bot_token: Telegram bot token. Falls back to TELEGRAM_BOT_TOKEN env var.
            webhook_secret: Webhook secret token. Falls back to TELEGRAM_WEBHOOK_SECRET env var.
        """
        # Telegram API Configuration
        self.bot_token = bot_token or os.getenv("TELEGRAM_BOT_TOKEN", "")
        self.webhook_secret = webhook_secret or os.getenv("TELEGRAM_WEBHOOK_SECRET", "telegram_secret_token")
        self.base_url = f"https://api.telegram.org/bot{self.bot_token}"

        # Redis for idempotency and rate limiting (reutiliza el mismo Redis)
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        try:
            self.redis_client = redis.from_url(redis_url, decode_responses=True)
            self.redis_client.ping()
            logger.info("✅ Telegram Service: Redis connected")
        except Exception as e:
            logger.error(f"❌ Telegram Service: Redis connection failed: {e}")
            self.redis_client = None

        # Rate limiting configuration
        self.rate_limit_window = 60  # seconds
        self.rate_limit_max_messages = 10  # max messages per window

        # Idempotency TTL
        self.idempotency_ttl = 86400  # 24 hours

        logger.info("📱 Telegram Service initialized")


    def verify_webhook(self, secret_token: Optional[str]) -> bool:
        """
        Verify webhook request from Telegram

        Telegram sends X-Telegram-Bot-Api-Secret-Token header

        Args:
            secret_token: Secret token from header

        Returns:
            True if valid, False otherwise
        """
        if not self.webhook_secret:
            logger.warning("⚠️ TELEGRAM_WEBHOOK_SECRET not configured")
            return True  # Allow in development

        is_valid = secret_token == self.webhook_secret

        if is_valid:
            logger.info("✅ Telegram webhook verified")
        else:
            logger.warning("⚠️ Invalid Telegram webhook secret")

        return is_valid


    def is_duplicate_message(self, update_id: int) -> bool:
        """
        Check if message has already been processed (idempotency)

        Args:
            update_id: Telegram update ID

        Returns:
            True if already processed, False otherwise
        """
        if not self.redis_client:
            return False

        try:
            key = f"telegram:processed:{update_id}"
            exists = self.redis_client.exists(key)

            if exists:
                logger.warning(f"⚠️ Duplicate Telegram update detected: {update_id}")
                return True

            # Mark as processed
            self.redis_client.setex(key, self.idempotency_ttl, "1")
            return False

        except Exception as e:
            logger.error(f"❌ Error checking duplicate update: {e}")
            return False


    def check_rate_limit(self, chat_id: int) -> bool:
        """
        Check if user has exceeded rate limit

        Args:
            chat_id: Telegram chat ID

        Returns:
            True if rate limit exceeded, False otherwise
        """
        if not self.redis_client:
            return False

        try:
            key = f"telegram:ratelimit:{chat_id}"
            current_count = self.redis_client.get(key)

            if current_count and int(current_count) >= self.rate_limit_max_messages:
                logger.warning(f"⚠️ Rate limit exceeded for chat {chat_id}")
                return True

            # Increment counter
            pipe = self.redis_client.pipeline()
            pipe.incr(key)
            pipe.expire(key, self.rate_limit_window)
            pipe.execute()

            return False

        except Exception as e:
            logger.error(f"❌ Error checking rate limit: {e}")
            return False


    def parse_message(self, update_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Parse incoming Telegram update

        Telegram webhook structure:
        {
            "update_id": 123456,
            "message": {
                "message_id": 789,
                "from": {"id": 12345, "first_name": "John", ...},
                "chat": {"id": 12345, "type": "private", ...},
                "date": 1234567890,
                "text": "Hello bot"
            }
        }

        Args:
            update_data: Raw update data from Telegram

        Returns:
            Parsed message data or None
        """
        try:
            # Check if it's a message update
            if "message" not in update_data:
                # Could be edited_message, channel_post, etc.
                return None

            message = update_data["message"]

            # Extract message data
            message_data = {
                "update_id": update_data.get("update_id"),
                "message_id": message.get("message_id"),
                "chat_id": message.get("chat", {}).get("id"),
                "user_id": message.get("from", {}).get("id"),
                "username": message.get("from", {}).get("username"),
                "first_name": message.get("from", {}).get("first_name"),
                "timestamp": message.get("date"),
                "type": None,  # will be set below
                "text": None,
                "document": None,
                "command": None
            }

            # Check for text message
            if "text" in message:
                text = message["text"]
                message_data["text"] = text

                # Check if it's a command
                if text.startswith("/"):
                    message_data["type"] = "command"
                    message_data["command"] = text.split()[0]  # e.g., "/start"
                else:
                    message_data["type"] = "text"

            # Check for document (PDF, DOCX, etc.)
            elif "document" in message:
                message_data["type"] = "document"
                message_data["document"] = message["document"]

            # Other types (photo, video, etc.) - not supported yet
            else:
                message_data["type"] = "unsupported"

            logger.info(f"📥 Received Telegram message from {message_data['chat_id']}: {message_data['text'] or message_data['type']}")

            return message_data

        except Exception as e:
            logger.error(f"❌ Error parsing Telegram update: {e}")
            return None


    async def send_message(
        self,
        chat_id: int,
        text: str,
        parse_mode: str = "Markdown"
    ) -> Dict[str, Any]:
        """
        Send text message via Telegram Bot API

        Args:
            chat_id: Telegram chat ID
            text: Message text
            parse_mode: "Markdown" or "HTML"

        Returns:
            API response data
        """
        if not self.bot_token:
            raise HTTPException(
                status_code=500,
                detail="Telegram bot not configured. Set TELEGRAM_BOT_TOKEN"
            )

        url = f"{self.base_url}/sendMessage"

        payload = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": parse_mode
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=payload, timeout=30.0)
                response.raise_for_status()

                result = response.json()
                logger.info(f"📤 Message sent to Telegram chat {chat_id}")

                return {
                    "success": True,
                    "message_id": result.get("result", {}).get("message_id"),
                    "status": "sent"
                }

        except httpx.HTTPStatusError as e:
            logger.error(f"❌ Telegram API error: {e.response.status_code} - {e.response.text}")
            raise HTTPException(
                status_code=e.response.status_code,
                detail=f"Telegram API error: {e.response.text}"
            )
        except Exception as e:
            logger.error(f"❌ Error sending Telegram message: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Error sending message: {str(e)}"
            )


    async def download_file(self, file_id: str) -> tuple[str, bytes]:
        """
        Download file from Telegram servers

        Args:
            file_id: Telegram file ID

        Returns:
            Tuple of (file_path, file_content)
        """
        if not self.bot_token:
            raise HTTPException(500, "Telegram bot not configured")

        try:
            # Get file info
            url = f"{self.base_url}/getFile"
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json={"file_id": file_id}, timeout=30.0)
                response.raise_for_status()

                file_info = response.json()
                file_path = file_info["result"]["file_path"]

                # Download file
                download_url = f"https://api.telegram.org/file/bot{self.bot_token}/{file_path}"
                download_response = await client.get(download_url, timeout=60.0)
                download_response.raise_for_status()

                logger.info(f"📥 Downloaded file from Telegram: {file_path}")

                return file_path, download_response.content

        except Exception as e:
            logger.error(f"❌ Error downloading Telegram file: {e}")
            raise HTTPException(500, f"Error downloading file: {str(e)}")


    async def send_chat_action(self, chat_id: int, action: str = "typing"):
        """
        Send chat action (typing indicator)

        Args:
            chat_id: Telegram chat ID
            action: "typing", "upload_document", etc.
        """
        url = f"{self.base_url}/sendChatAction"
        payload = {"chat_id": chat_id, "action": action}

        try:
            async with httpx.AsyncClient() as client:
                await client.post(url, json=payload, timeout=10.0)
        except Exception as e:
            logger.error(f"⚠️ Error sending chat action: {e}")


    def get_rate_limit_info(self, chat_id: int) -> Dict[str, Any]:
        """
        Get rate limit information for a chat

        Args:
            chat_id: Telegram chat ID

        Returns:
            Rate limit information
        """
        if not self.redis_client:
            return {
                "enabled": False,
                "message": "Rate limiting not available"
            }

        try:
            key = f"telegram:ratelimit:{chat_id}"
            current_count = self.redis_client.get(key)
            ttl = self.redis_client.ttl(key)

            count = int(current_count) if current_count else 0
            remaining = max(0, self.rate_limit_max_messages - count)

            return {
                "enabled": True,
                "limit": self.rate_limit_max_messages,
                "remaining": remaining,
                "reset_in_seconds": ttl if ttl > 0 else self.rate_limit_window,
                "exceeded": count >= self.rate_limit_max_messages
            }

        except Exception as e:
            logger.error(f"❌ Error getting rate limit info: {e}")
            return {"enabled": False, "error": str(e)}


    async def set_webhook(self, webhook_url: str) -> Dict[str, Any]:
        """
        Register webhook URL with Telegram API

        Args:
            webhook_url: HTTPS URL for Telegram to send updates to

        Returns:
            API response data
        """
        if not self.bot_token:
            raise HTTPException(500, "Telegram bot not configured. Set bot_token.")

        url = f"{self.base_url}/setWebhook"
        payload = {
            "url": webhook_url,
        }
        if self.webhook_secret:
            payload["secret_token"] = self.webhook_secret

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=payload, timeout=30.0)
                result = response.json()

                if not result.get("ok"):
                    error_desc = result.get("description", "Unknown error")
                    logger.error(f"❌ Telegram setWebhook failed: {error_desc}")
                    raise HTTPException(502, f"Telegram API error: {error_desc}")

                logger.info(f"✅ Telegram webhook set to: {webhook_url}")
                return result

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"❌ Error setting Telegram webhook: {e}")
            raise HTTPException(502, f"Error setting webhook: {str(e)}")

    async def delete_webhook(self) -> Dict[str, Any]:
        """
        Delete the current webhook from Telegram API

        Returns:
            API response data
        """
        if not self.bot_token:
            raise HTTPException(500, "Telegram bot not configured. Set bot_token.")

        url = f"{self.base_url}/deleteWebhook"

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, timeout=30.0)
                result = response.json()

                if not result.get("ok"):
                    error_desc = result.get("description", "Unknown error")
                    logger.error(f"❌ Telegram deleteWebhook failed: {error_desc}")
                    raise HTTPException(502, f"Telegram API error: {error_desc}")

                logger.info("✅ Telegram webhook deleted")
                return result

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"❌ Error deleting Telegram webhook: {e}")
            raise HTTPException(502, f"Error deleting webhook: {str(e)}")

    async def get_webhook_info(self) -> Dict[str, Any]:
        """
        Get current webhook info from Telegram API

        Returns:
            Webhook info from Telegram
        """
        if not self.bot_token:
            raise HTTPException(500, "Telegram bot not configured. Set bot_token.")

        url = f"{self.base_url}/getWebhookInfo"

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(url, timeout=30.0)
                result = response.json()
                return result.get("result", {})

        except Exception as e:
            logger.error(f"❌ Error getting Telegram webhook info: {e}")
            raise HTTPException(502, f"Error getting webhook info: {str(e)}")


def create_telegram_service(bot_token: str, webhook_secret: str = "") -> TelegramService:
    """
    Factory function to create a TelegramService with specific credentials.

    Args:
        bot_token: Telegram bot token
        webhook_secret: Webhook secret token

    Returns:
        Configured TelegramService instance
    """
    return TelegramService(bot_token=bot_token, webhook_secret=webhook_secret)


# Global instance
telegram_service = TelegramService()


def get_telegram_service() -> TelegramService:
    """Get Telegram service instance"""
    return telegram_service
