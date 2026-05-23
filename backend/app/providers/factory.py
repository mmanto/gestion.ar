"""
WhatsApp Provider Factory
Factory para crear instancias de proveedores según la configuración
"""

import logging
from typing import Dict, Any, Optional

from app.models.channel import WhatsAppConfig, WhatsAppProvider

from .base import WhatsAppProviderBase
from .meta_provider import MetaWhatsAppProvider
from .twilio_provider import TwilioWhatsAppProvider

logger = logging.getLogger(__name__)


class WhatsAppProviderFactory:
    """
    Factory para crear proveedores de WhatsApp según la configuración.
    """

    # Registro de proveedores disponibles
    _providers: Dict[WhatsAppProvider, type] = {
        WhatsAppProvider.META: MetaWhatsAppProvider,
        WhatsAppProvider.TWILIO: TwilioWhatsAppProvider,
    }

    @classmethod
    def register_provider(cls, provider_type: WhatsAppProvider, provider_class: type):
        """
        Registra un nuevo proveedor.

        Args:
            provider_type: Tipo de proveedor (enum)
            provider_class: Clase del proveedor
        """
        cls._providers[provider_type] = provider_class
        logger.info(f"Proveedor registrado: {provider_type.value}")

    @classmethod
    def create_from_config(cls, whatsapp_config: WhatsAppConfig) -> Optional[WhatsAppProviderBase]:
        """
        Crea un proveedor a partir de la configuración de WhatsApp.

        Args:
            whatsapp_config: Configuración del canal WhatsApp

        Returns:
            Instancia del proveedor o None si falla
        """
        provider_type = whatsapp_config.provider

        if provider_type not in cls._providers:
            logger.error(f"Proveedor no soportado: {provider_type}")
            return None

        # Extraer configuración específica del proveedor
        config = cls._extract_provider_config(whatsapp_config, provider_type)
        if not config:
            logger.error(f"Configuración inválida para proveedor: {provider_type}")
            return None

        # Crear instancia
        provider_class = cls._providers[provider_type]
        provider = provider_class(config)

        # Inicializar
        if not provider.initialize():
            logger.error(f"Error inicializando proveedor: {provider_type}")
            return None

        return provider

    @classmethod
    def create(
        cls,
        provider_type: WhatsAppProvider,
        config: Dict[str, Any]
    ) -> Optional[WhatsAppProviderBase]:
        """
        Crea un proveedor con configuración directa.

        Args:
            provider_type: Tipo de proveedor
            config: Diccionario de configuración

        Returns:
            Instancia del proveedor o None si falla
        """
        if provider_type not in cls._providers:
            logger.error(f"Proveedor no soportado: {provider_type}")
            return None

        provider_class = cls._providers[provider_type]
        provider = provider_class(config)

        if not provider.initialize():
            logger.error(f"Error inicializando proveedor: {provider_type}")
            return None

        return provider

    @classmethod
    def _extract_provider_config(
        cls,
        whatsapp_config: WhatsAppConfig,
        provider_type: WhatsAppProvider
    ) -> Optional[Dict[str, Any]]:
        """
        Extrae la configuración específica del proveedor.

        Soporta tanto la nueva estructura (meta_config/twilio_config)
        como los campos legacy para compatibilidad.
        """
        if provider_type == WhatsAppProvider.META:
            # Intentar nueva estructura primero
            if whatsapp_config.meta_config:
                return whatsapp_config.meta_config.model_dump()

            # Fallback a campos legacy
            if whatsapp_config.phone_number_id and whatsapp_config.access_token:
                return {
                    "phone_number_id": whatsapp_config.phone_number_id,
                    "access_token": whatsapp_config.access_token,
                    "verify_token": whatsapp_config.verify_token or "",
                    "api_version": whatsapp_config.api_version or "v21.0",
                    "app_secret": "",
                }

            return None

        elif provider_type == WhatsAppProvider.TWILIO:
            if whatsapp_config.twilio_config:
                return whatsapp_config.twilio_config.model_dump()
            return None

        return None

    @classmethod
    def get_available_providers(cls) -> list:
        """Retorna lista de proveedores disponibles"""
        return [p.value for p in cls._providers.keys()]


def get_whatsapp_provider(whatsapp_config: WhatsAppConfig) -> Optional[WhatsAppProviderBase]:
    """
    Función de conveniencia para obtener un proveedor.

    Args:
        whatsapp_config: Configuración de WhatsApp

    Returns:
        Instancia del proveedor o None
    """
    return WhatsAppProviderFactory.create_from_config(whatsapp_config)
