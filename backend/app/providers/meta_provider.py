"""
Meta/Facebook Cloud API WhatsApp Provider
Implementación del proveedor para la API directa de Meta/Facebook
"""

import hashlib
import hmac
import logging
from typing import Optional, Dict, Any, List

import httpx

from .base import WhatsAppProviderBase, MessageResult, ParsedMessage

logger = logging.getLogger(__name__)


class MetaWhatsAppProvider(WhatsAppProviderBase):
    """
    Proveedor de WhatsApp usando Meta/Facebook Cloud API directamente.
    """

    @property
    def provider_name(self) -> str:
        return "meta"

    def initialize(self) -> bool:
        """Inicializa el proveedor Meta"""
        try:
            self.phone_number_id = self.config.get("phone_number_id", "")
            self.access_token = self.config.get("access_token", "")
            self.verify_token = self.config.get("verify_token", "")
            self.api_version = self.config.get("api_version", "v21.0")
            self.app_secret = self.config.get("app_secret", "")
            self.base_url = f"https://graph.facebook.com/{self.api_version}"

            if not self.phone_number_id or not self.access_token:
                logger.error("Meta provider: phone_number_id y access_token son requeridos")
                return False

            self._initialized = True
            logger.info(f"Meta WhatsApp provider inicializado para phone_number_id: {self.phone_number_id}")
            return True

        except Exception as e:
            logger.error(f"Error inicializando Meta provider: {e}")
            return False

    def verify_webhook(self, mode: str, token: str, challenge: str) -> Optional[str]:
        """Verifica el webhook de Meta"""
        if mode == "subscribe" and token == self.verify_token:
            logger.info("Meta webhook verificado exitosamente")
            return challenge
        logger.warning("Meta webhook verification failed")
        return None

    def verify_signature(self, payload: str, signature: str) -> bool:
        """Verifica la firma HMAC-SHA256 de Meta"""
        if not signature:
            return False

        if not self.app_secret:
            logger.warning("app_secret no configurado, omitiendo verificación de firma")
            return True

        try:
            expected_signature = hmac.new(
                self.app_secret.encode(),
                payload.encode(),
                hashlib.sha256
            ).hexdigest()

            signature_hash = signature.replace("sha256=", "")
            is_valid = hmac.compare_digest(expected_signature, signature_hash)

            if is_valid:
                logger.info("Meta webhook signature verificada")
            else:
                logger.warning("Meta webhook signature inválida")

            return is_valid

        except Exception as e:
            logger.error(f"Error verificando firma Meta: {e}")
            return False

    def parse_webhook(self, webhook_data: Dict[str, Any]) -> Optional[ParsedMessage]:
        """Parsea el webhook de Meta Cloud API"""
        try:
            entry = webhook_data.get("entry", [])
            if not entry:
                return None

            changes = entry[0].get("changes", [])
            if not changes:
                return None

            value = changes[0].get("value", {})
            messages = value.get("messages", [])

            if not messages:
                return None

            message = messages[0]

            text = None
            media = None

            if message.get("type") == "text":
                text = message.get("text", {}).get("body", "")
            elif message.get("type") in ["image", "document", "audio", "video"]:
                media = message.get(message.get("type"), {})

            return ParsedMessage(
                message_id=message.get("id", ""),
                from_number=message.get("from", ""),
                timestamp=message.get("timestamp", ""),
                message_type=message.get("type", "unknown"),
                text=text,
                media=media,
                metadata=value.get("metadata", {})
            )

        except Exception as e:
            logger.error(f"Error parseando webhook Meta: {e}")
            return None

    async def send_message(
        self,
        to_number: str,
        message: str,
        preview_url: bool = False
    ) -> MessageResult:
        """Envía mensaje via Meta Cloud API"""
        if not self._initialized:
            return MessageResult(
                success=False,
                error="Provider no inicializado"
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
                message_id = result.get("messages", [{}])[0].get("id")

                logger.info(f"Meta: Mensaje enviado a {to_number}, id: {message_id}")

                return MessageResult(
                    success=True,
                    message_id=message_id,
                    status="sent",
                    raw_response=result
                )

        except httpx.HTTPStatusError as e:
            error_msg = f"Meta API error: {e.response.status_code} - {e.response.text}"
            logger.error(error_msg)
            return MessageResult(
                success=False,
                error=error_msg,
                status="failed"
            )
        except Exception as e:
            error_msg = f"Error enviando mensaje Meta: {e}"
            logger.error(error_msg)
            return MessageResult(
                success=False,
                error=error_msg,
                status="failed"
            )

    async def send_template_message(
        self,
        to_number: str,
        template_name: str,
        language_code: str = "es",
        parameters: Optional[List[str]] = None
    ) -> MessageResult:
        """Envía mensaje de plantilla via Meta Cloud API"""
        if not self._initialized:
            return MessageResult(
                success=False,
                error="Provider no inicializado"
            )

        url = f"{self.base_url}/{self.phone_number_id}/messages"
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }

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
                message_id = result.get("messages", [{}])[0].get("id")

                logger.info(f"Meta: Template enviado a {to_number}")

                return MessageResult(
                    success=True,
                    message_id=message_id,
                    status="sent",
                    raw_response=result
                )

        except Exception as e:
            error_msg = f"Error enviando template Meta: {e}"
            logger.error(error_msg)
            return MessageResult(
                success=False,
                error=error_msg,
                status="failed"
            )

    async def mark_message_as_read(self, message_id: str) -> bool:
        """Marca mensaje como leído via Meta Cloud API"""
        if not self._initialized:
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
                logger.info(f"Meta: Mensaje marcado como leído: {message_id}")
                return True

        except Exception as e:
            logger.error(f"Error marcando mensaje como leído: {e}")
            return False
