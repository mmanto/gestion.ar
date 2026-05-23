"""
Twilio WhatsApp Provider
Implementación del proveedor para Twilio WhatsApp API
"""

import base64
import hashlib
import hmac
import logging
from typing import Optional, Dict, Any, List

import httpx

from .base import WhatsAppProviderBase, MessageResult, ParsedMessage

logger = logging.getLogger(__name__)


class TwilioWhatsAppProvider(WhatsAppProviderBase):
    """
    Proveedor de WhatsApp usando Twilio API.

    Documentación: https://www.twilio.com/docs/whatsapp/api
    """

    @property
    def provider_name(self) -> str:
        return "twilio"

    def initialize(self) -> bool:
        """Inicializa el proveedor Twilio"""
        try:
            self.account_sid = self.config.get("account_sid", "")
            self.auth_token = self.config.get("auth_token", "")
            self.phone_number = self.config.get("phone_number", "")
            self.messaging_service_sid = self.config.get("messaging_service_sid")

            # Asegurar formato whatsapp:+...
            if self.phone_number and not self.phone_number.startswith("whatsapp:"):
                self.phone_number = f"whatsapp:{self.phone_number}"

            self.base_url = f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}"

            if not self.account_sid or not self.auth_token or not self.phone_number:
                logger.error("Twilio provider: account_sid, auth_token y phone_number son requeridos")
                return False

            self._initialized = True
            logger.info(f"Twilio WhatsApp provider inicializado para: {self.phone_number}")
            return True

        except Exception as e:
            logger.error(f"Error inicializando Twilio provider: {e}")
            return False

    def verify_webhook(self, mode: str, token: str, challenge: str) -> Optional[str]:
        """
        Twilio no usa el mismo patrón de verificación que Meta.
        La verificación se hace validando la firma en cada request.
        Retorna el challenge para compatibilidad.
        """
        # Twilio valida mediante firma, no challenge-response
        return challenge

    def verify_signature(self, payload: str, signature: str) -> bool:
        """
        Verifica la firma de Twilio (X-Twilio-Signature).

        La firma se calcula como HMAC-SHA1 de la URL + parámetros ordenados.
        """
        if not signature:
            logger.warning("Twilio: No signature provided")
            return False

        if not self.auth_token:
            logger.warning("Twilio: auth_token no configurado")
            return True  # Permitir en desarrollo

        try:
            # Twilio firma requiere la URL completa + parámetros
            # El payload aquí es el URL + form params concatenados
            expected = base64.b64encode(
                hmac.new(
                    self.auth_token.encode(),
                    payload.encode(),
                    hashlib.sha1
                ).digest()
            ).decode()

            is_valid = hmac.compare_digest(expected, signature)

            if is_valid:
                logger.info("Twilio webhook signature verificada")
            else:
                logger.warning("Twilio webhook signature inválida")

            return is_valid

        except Exception as e:
            logger.error(f"Error verificando firma Twilio: {e}")
            return False

    def parse_webhook(self, webhook_data: Dict[str, Any]) -> Optional[ParsedMessage]:
        """
        Parsea el webhook de Twilio.

        Twilio envía datos como form-urlencoded, no JSON.
        Los campos principales son:
        - MessageSid: ID del mensaje
        - From: whatsapp:+1234567890
        - To: whatsapp:+0987654321
        - Body: Texto del mensaje
        - NumMedia: Cantidad de archivos adjuntos
        - MediaUrl0, MediaContentType0, etc: Archivos adjuntos
        """
        try:
            message_sid = webhook_data.get("MessageSid", "")
            from_number = webhook_data.get("From", "")
            body = webhook_data.get("Body", "")
            num_media = int(webhook_data.get("NumMedia", 0))

            if not message_sid or not from_number:
                return None

            # Limpiar formato whatsapp: del número
            clean_from = from_number.replace("whatsapp:", "")

            # Determinar tipo de mensaje
            message_type = "text"
            media = None

            if num_media > 0:
                message_type = "media"
                media = {
                    "count": num_media,
                    "items": []
                }
                for i in range(num_media):
                    media["items"].append({
                        "url": webhook_data.get(f"MediaUrl{i}"),
                        "content_type": webhook_data.get(f"MediaContentType{i}")
                    })

            return ParsedMessage(
                message_id=message_sid,
                from_number=clean_from,
                timestamp=webhook_data.get("DateCreated", ""),
                message_type=message_type,
                text=body if body else None,
                media=media,
                metadata={
                    "account_sid": webhook_data.get("AccountSid"),
                    "to": webhook_data.get("To"),
                    "sms_sid": webhook_data.get("SmsSid"),
                    "sms_status": webhook_data.get("SmsStatus"),
                    "profile_name": webhook_data.get("ProfileName")
                }
            )

        except Exception as e:
            logger.error(f"Error parseando webhook Twilio: {e}")
            return None

    async def send_message(
        self,
        to_number: str,
        message: str,
        preview_url: bool = False  # No soportado por Twilio
    ) -> MessageResult:
        """
        Envía mensaje via Twilio API.

        Usa la API REST de Twilio para enviar mensajes de WhatsApp.
        """
        if not self._initialized:
            return MessageResult(
                success=False,
                error="Provider no inicializado"
            )

        # Asegurar formato whatsapp:+...
        if not to_number.startswith("whatsapp:"):
            to_number = f"whatsapp:{to_number}"

        url = f"{self.base_url}/Messages.json"

        # Autenticación básica
        auth = (self.account_sid, self.auth_token)

        # Twilio usa form data, no JSON
        data = {
            "To": to_number,
            "From": self.phone_number,
            "Body": message
        }

        # Usar MessagingServiceSid si está configurado
        if self.messaging_service_sid:
            data["MessagingServiceSid"] = self.messaging_service_sid

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    auth=auth,
                    data=data,
                    timeout=30.0
                )
                response.raise_for_status()

                result = response.json()
                message_sid = result.get("sid")

                logger.info(f"Twilio: Mensaje enviado a {to_number}, sid: {message_sid}")

                return MessageResult(
                    success=True,
                    message_id=message_sid,
                    status=result.get("status", "sent"),
                    raw_response=result
                )

        except httpx.HTTPStatusError as e:
            error_msg = f"Twilio API error: {e.response.status_code} - {e.response.text}"
            logger.error(error_msg)
            return MessageResult(
                success=False,
                error=error_msg,
                status="failed"
            )
        except Exception as e:
            error_msg = f"Error enviando mensaje Twilio: {e}"
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
        """
        Envía mensaje de plantilla via Twilio.

        Twilio usa Content Templates para WhatsApp.
        https://www.twilio.com/docs/content/whatsapp-template-message
        """
        if not self._initialized:
            return MessageResult(
                success=False,
                error="Provider no inicializado"
            )

        # Asegurar formato whatsapp:+...
        if not to_number.startswith("whatsapp:"):
            to_number = f"whatsapp:{to_number}"

        url = f"{self.base_url}/Messages.json"
        auth = (self.account_sid, self.auth_token)

        # Twilio Content API para templates
        # ContentSid es el ID del template en Twilio
        data = {
            "To": to_number,
            "From": self.phone_number,
            "ContentSid": template_name,  # En Twilio, template_name es el ContentSid
        }

        # Agregar variables si existen
        if parameters:
            # Las variables van como ContentVariables en formato JSON
            import json
            variables = {str(i + 1): param for i, param in enumerate(parameters)}
            data["ContentVariables"] = json.dumps(variables)

        if self.messaging_service_sid:
            data["MessagingServiceSid"] = self.messaging_service_sid

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    auth=auth,
                    data=data,
                    timeout=30.0
                )
                response.raise_for_status()

                result = response.json()
                message_sid = result.get("sid")

                logger.info(f"Twilio: Template enviado a {to_number}")

                return MessageResult(
                    success=True,
                    message_id=message_sid,
                    status=result.get("status", "sent"),
                    raw_response=result
                )

        except Exception as e:
            error_msg = f"Error enviando template Twilio: {e}"
            logger.error(error_msg)
            return MessageResult(
                success=False,
                error=error_msg,
                status="failed"
            )

    async def mark_message_as_read(self, message_id: str) -> bool:
        """
        Twilio no soporta marcar mensajes como leídos de la misma manera que Meta.
        Los read receipts en Twilio se manejan automáticamente.
        """
        logger.info(f"Twilio: mark_message_as_read no soportado (message: {message_id})")
        return True  # Retornamos True ya que no es un error
