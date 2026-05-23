"""
WhatsApp Business API Service
Handles webhook verification, message receiving/sending, and idempotency
"""

import os
import logging
import hashlib
import hmac
from typing import Optional, Dict, Any, List
import httpx
import redis
from fastapi import HTTPException

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class WhatsAppService:
    """Service to interact with WhatsApp Business API"""

    def __init__(self):
        """Initialize WhatsApp service"""
        # WhatsApp API Configuration
        self.access_token = os.getenv("WHATSAPP_TOKEN", "")
        self.phone_number_id = os.getenv("WHATSAPP_PHONE_ID", "")
        self.verify_token = os.getenv("WEBHOOK_VERIFY_TOKEN", "secret_verify_token")
        self.api_version = os.getenv("WHATSAPP_API_VERSION", "v21.0")
        self.base_url = f"https://graph.facebook.com/{self.api_version}"

        # Redis for idempotency and rate limiting
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        try:
            self.redis_client = redis.from_url(redis_url, decode_responses=True)
            self.redis_client.ping()
            logger.info("✅ WhatsApp Service: Redis connected")
        except Exception as e:
            logger.error(f"❌ WhatsApp Service: Redis connection failed: {e}")
            self.redis_client = None

        # Rate limiting configuration
        self.rate_limit_window = 60  # seconds
        self.rate_limit_max_messages = 10  # max messages per window

        # Idempotency TTL
        self.idempotency_ttl = 86400  # 24 hours in seconds

        logger.info("📱 WhatsApp Service initialized")


    def verify_webhook(self, mode: str, token: str, challenge: str) -> Optional[str]:
        """
        Verify webhook for WhatsApp

        Args:
            mode: Verification mode
            token: Verification token
            challenge: Challenge string

        Returns:
            Challenge string if verification succeeds, None otherwise
        """
        if mode == "subscribe" and token == self.verify_token:
            logger.info("✅ Webhook verified successfully")
            return challenge
        else:
            logger.warning("⚠️ Webhook verification failed")
            return None


    def verify_signature(self, payload: str, signature: str) -> bool:
        """
        Verify WhatsApp webhook signature

        Args:
            payload: Raw request body
            signature: X-Hub-Signature-256 header value

        Returns:
            True if signature is valid, False otherwise
        """
        if not signature:
            return False

        try:
            # Get app secret from env
            app_secret = os.getenv("WHATSAPP_APP_SECRET", "")
            if not app_secret:
                logger.warning("⚠️ WHATSAPP_APP_SECRET not configured, skipping signature verification")
                return True  # Allow in development

            # Compute expected signature
            expected_signature = hmac.new(
                app_secret.encode(),
                payload.encode(),
                hashlib.sha256
            ).hexdigest()

            # Compare signatures
            signature_hash = signature.replace("sha256=", "")
            is_valid = hmac.compare_digest(expected_signature, signature_hash)

            if is_valid:
                logger.info("✅ Webhook signature verified")
            else:
                logger.warning("⚠️ Invalid webhook signature")

            return is_valid

        except Exception as e:
            logger.error(f"❌ Error verifying signature: {e}")
            return False


    def is_duplicate_message(self, message_id: str) -> bool:
        """
        Check if message has already been processed (idempotency)

        Args:
            message_id: WhatsApp message ID

        Returns:
            True if message was already processed, False otherwise
        """
        if not self.redis_client:
            return False

        try:
            key = f"whatsapp:processed:{message_id}"
            exists = self.redis_client.exists(key)

            if exists:
                logger.warning(f"⚠️ Duplicate message detected: {message_id}")
                return True

            # Mark as processed
            self.redis_client.setex(key, self.idempotency_ttl, "1")
            return False

        except Exception as e:
            logger.error(f"❌ Error checking duplicate message: {e}")
            return False


    def check_rate_limit(self, phone_number: str) -> bool:
        """
        Check if user has exceeded rate limit

        Args:
            phone_number: User's phone number

        Returns:
            True if rate limit exceeded, False otherwise
        """
        if not self.redis_client:
            return False

        try:
            key = f"whatsapp:ratelimit:{phone_number}"
            current_count = self.redis_client.get(key)

            if current_count and int(current_count) >= self.rate_limit_max_messages:
                logger.warning(f"⚠️ Rate limit exceeded for {phone_number}")
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


    def parse_message(self, webhook_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Parse incoming WhatsApp message from webhook

        Args:
            webhook_data: Raw webhook data

        Returns:
            Parsed message data or None
        """
        try:
            # Navigate through WhatsApp webhook structure
            entry = webhook_data.get("entry", [])
            if not entry:
                return None

            changes = entry[0].get("changes", [])
            if not changes:
                return None

            value = changes[0].get("value", {})
            messages = value.get("messages", [])

            if not messages:
                # Could be a status update, not a message
                return None

            message = messages[0]

            # Extract message data
            message_data = {
                "message_id": message.get("id"),
                "from_number": message.get("from"),
                "timestamp": message.get("timestamp"),
                "type": message.get("type"),  # text, image, document, etc.
                "text": None,
                "media": None,
                "metadata": value.get("metadata", {})
            }

            # Extract text content
            if message.get("type") == "text":
                message_data["text"] = message.get("text", {}).get("body", "")

            # Extract media (for future implementation)
            elif message.get("type") in ["image", "document", "audio", "video"]:
                message_data["media"] = message.get(message.get("type"), {})

            logger.info(f"📥 Received message from {message_data['from_number']}: {message_data['text']}")

            return message_data

        except Exception as e:
            logger.error(f"❌ Error parsing message: {e}")
            return None


    async def send_message(
        self,
        to_number: str,
        message: str,
        preview_url: bool = False
    ) -> Dict[str, Any]:
        """
        Send text message via WhatsApp Business API

        Args:
            to_number: Recipient phone number
            message: Message text
            preview_url: Enable URL preview

        Returns:
            API response data
        """
        if not self.access_token or not self.phone_number_id:
            raise HTTPException(
                status_code=500,
                detail="WhatsApp API not configured. Set WHATSAPP_TOKEN and WHATSAPP_PHONE_ID"
            )

        url = f"{self.base_url}/{self.phone_number_id}/messages"
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to_number,
            "type": "text",
            "text": {
                "preview_url": preview_url,
                "body": message
            }
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=headers, json=payload, timeout=30.0)
                response.raise_for_status()

                result = response.json()
                logger.info(f"📤 Message sent to {to_number}: {result}")

                return {
                    "success": True,
                    "message_id": result.get("messages", [{}])[0].get("id"),
                    "status": "sent"
                }

        except httpx.HTTPStatusError as e:
            logger.error(f"❌ WhatsApp API error: {e.response.status_code} - {e.response.text}")
            raise HTTPException(
                status_code=e.response.status_code,
                detail=f"WhatsApp API error: {e.response.text}"
            )
        except Exception as e:
            logger.error(f"❌ Error sending message: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Error sending message: {str(e)}"
            )


    async def send_template_message(
        self,
        to_number: str,
        template_name: str,
        language_code: str = "es",
        parameters: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Send template message via WhatsApp Business API

        Args:
            to_number: Recipient phone number
            template_name: Template name
            language_code: Language code (default: es)
            parameters: Template parameters

        Returns:
            API response data
        """
        if not self.access_token or not self.phone_number_id:
            raise HTTPException(
                status_code=500,
                detail="WhatsApp API not configured"
            )

        url = f"{self.base_url}/{self.phone_number_id}/messages"
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }

        # Build template components
        components = []
        if parameters:
            components.append({
                "type": "body",
                "parameters": [{"type": "text", "text": param} for param in parameters]
            })

        payload = {
            "messaging_product": "whatsapp",
            "to": to_number,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": language_code},
                "components": components
            }
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=headers, json=payload, timeout=30.0)
                response.raise_for_status()

                result = response.json()
                logger.info(f"📤 Template message sent to {to_number}")

                return {
                    "success": True,
                    "message_id": result.get("messages", [{}])[0].get("id"),
                    "status": "sent"
                }

        except Exception as e:
            logger.error(f"❌ Error sending template message: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Error sending template: {str(e)}"
            )


    async def mark_message_as_read(self, message_id: str) -> bool:
        """
        Mark message as read

        Args:
            message_id: WhatsApp message ID

        Returns:
            True if successful
        """
        if not self.access_token or not self.phone_number_id:
            return False

        url = f"{self.base_url}/{self.phone_number_id}/messages"
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }

        payload = {
            "messaging_product": "whatsapp",
            "status": "read",
            "message_id": message_id
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=headers, json=payload, timeout=10.0)
                response.raise_for_status()
                logger.info(f"✅ Message marked as read: {message_id}")
                return True

        except Exception as e:
            logger.error(f"❌ Error marking message as read: {e}")
            return False


    def get_rate_limit_info(self, phone_number: str) -> Dict[str, Any]:
        """
        Get rate limit information for a phone number

        Args:
            phone_number: User's phone number

        Returns:
            Rate limit information
        """
        if not self.redis_client:
            return {
                "enabled": False,
                "message": "Rate limiting not available (Redis not connected)"
            }

        try:
            key = f"whatsapp:ratelimit:{phone_number}"
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


# Global instance
whatsapp_service = WhatsAppService()


def get_whatsapp_service() -> WhatsAppService:
    """Get WhatsApp service instance"""
    return whatsapp_service
