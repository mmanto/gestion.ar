"""
Base WhatsApp Provider Interface
Define la interfaz común para todos los proveedores de WhatsApp
"""

from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class MessageResult:
    """Resultado de envío de mensaje"""
    success: bool
    message_id: Optional[str] = None
    status: str = "unknown"
    error: Optional[str] = None
    raw_response: Optional[Dict[str, Any]] = None


@dataclass
class ParsedMessage:
    """Mensaje parseado del webhook"""
    message_id: str
    from_number: str
    timestamp: str
    message_type: str  # text, image, document, audio, video, etc.
    text: Optional[str] = None
    media: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None


class WhatsAppProviderBase(ABC):
    """
    Clase base abstracta para proveedores de WhatsApp.
    Define la interfaz que todos los proveedores deben implementar.
    """

    def __init__(self, config: Dict[str, Any]):
        """
        Inicializa el proveedor con su configuración.

        Args:
            config: Diccionario con la configuración del proveedor
        """
        self.config = config
        self._initialized = False

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Nombre del proveedor (ej: 'meta', 'twilio')"""
        pass

    @abstractmethod
    def initialize(self) -> bool:
        """
        Inicializa el proveedor y valida la configuración.

        Returns:
            True si la inicialización fue exitosa
        """
        pass

    @abstractmethod
    def verify_webhook(self, mode: str, token: str, challenge: str) -> Optional[str]:
        """
        Verifica el webhook del proveedor.

        Args:
            mode: Modo de verificación
            token: Token de verificación
            challenge: Challenge string

        Returns:
            Challenge string si la verificación es exitosa, None si falla
        """
        pass

    @abstractmethod
    def verify_signature(self, payload: str, signature: str) -> bool:
        """
        Verifica la firma del webhook.

        Args:
            payload: Cuerpo del request
            signature: Firma del header

        Returns:
            True si la firma es válida
        """
        pass

    @abstractmethod
    def parse_webhook(self, webhook_data: Dict[str, Any]) -> Optional[ParsedMessage]:
        """
        Parsea los datos del webhook y extrae el mensaje.

        Args:
            webhook_data: Datos crudos del webhook

        Returns:
            ParsedMessage o None si no hay mensaje
        """
        pass

    @abstractmethod
    async def send_message(
        self,
        to_number: str,
        message: str,
        preview_url: bool = False
    ) -> MessageResult:
        """
        Envía un mensaje de texto.

        Args:
            to_number: Número del destinatario
            message: Texto del mensaje
            preview_url: Habilitar preview de URLs

        Returns:
            MessageResult con el resultado del envío
        """
        pass

    @abstractmethod
    async def send_template_message(
        self,
        to_number: str,
        template_name: str,
        language_code: str = "es",
        parameters: Optional[List[str]] = None
    ) -> MessageResult:
        """
        Envía un mensaje de plantilla.

        Args:
            to_number: Número del destinatario
            template_name: Nombre de la plantilla
            language_code: Código de idioma
            parameters: Parámetros de la plantilla

        Returns:
            MessageResult con el resultado del envío
        """
        pass

    @abstractmethod
    async def mark_message_as_read(self, message_id: str) -> bool:
        """
        Marca un mensaje como leído.

        Args:
            message_id: ID del mensaje

        Returns:
            True si fue exitoso
        """
        pass

    def get_webhook_url_path(self, channel_id: str) -> str:
        """
        Genera el path del webhook para este proveedor.

        Args:
            channel_id: ID del canal

        Returns:
            Path del webhook (ej: /api/webhook/whatsapp/twilio/{channel_id})
        """
        return f"/api/webhook/whatsapp/{self.provider_name}/{channel_id}"
