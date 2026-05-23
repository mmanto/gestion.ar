"""
Channel models - Pydantic models for Channel entity
Represents communication channels (WhatsApp, Telegram) associated with a Bot
"""

from typing import Optional, Dict
from pydantic import BaseModel, Field
from enum import Enum


class ChannelType(str, Enum):
    """Tipos de canales de comunicación soportados"""
    WHATSAPP = "whatsapp"
    TELEGRAM = "telegram"
    WEB = "web"
    PWA = "pwa"


class WhatsAppProvider(str, Enum):
    """Proveedores de WhatsApp Business API soportados"""
    META = "meta"  # Meta/Facebook Cloud API (directo)
    TWILIO = "twilio"  # Twilio WhatsApp API


class ChannelStatus(str, Enum):
    """Estados del canal"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    PENDING = "pending"  # Pendiente de configuración
    ERROR = "error"  # Error en la configuración


class MetaWhatsAppConfig(BaseModel):
    """Configuración específica para Meta/Facebook Cloud API"""
    phone_number_id: str = Field(..., description="ID del número de teléfono de WhatsApp Business")
    access_token: str = Field(..., description="Token de acceso de la API")
    verify_token: str = Field(default="", description="Token de verificación del webhook")
    api_version: str = Field(default="v21.0", description="Versión de la API de WhatsApp")
    business_account_id: Optional[str] = Field(None, description="ID de la cuenta de negocio")
    app_secret: Optional[str] = Field(None, description="App secret para verificar firmas de webhook")


class TwilioWhatsAppConfig(BaseModel):
    """Configuración específica para Twilio WhatsApp"""
    account_sid: str = Field(..., description="Twilio Account SID")
    auth_token: str = Field(..., description="Twilio Auth Token")
    phone_number: str = Field(..., description="Número de teléfono Twilio (formato: whatsapp:+1234567890)")
    messaging_service_sid: Optional[str] = Field(None, description="Twilio Messaging Service SID (opcional)")


class WhatsAppConfig(BaseModel):
    """Configuración específica para WhatsApp con soporte multi-proveedor"""
    provider: WhatsAppProvider = Field(default=WhatsAppProvider.META, description="Proveedor de WhatsApp API")

    # Configuración específica por proveedor (solo uno debe estar presente)
    meta_config: Optional[MetaWhatsAppConfig] = Field(None, description="Configuración para Meta Cloud API")
    twilio_config: Optional[TwilioWhatsAppConfig] = Field(None, description="Configuración para Twilio")

    # Campos legacy para compatibilidad hacia atrás (deprecated)
    phone_number_id: Optional[str] = Field(None, description="[DEPRECATED] Usar meta_config.phone_number_id")
    access_token: Optional[str] = Field(None, description="[DEPRECATED] Usar meta_config.access_token")
    verify_token: Optional[str] = Field(default="", description="[DEPRECATED] Usar meta_config.verify_token")
    api_version: Optional[str] = Field(default="v21.0", description="[DEPRECATED] Usar meta_config.api_version")
    business_account_id: Optional[str] = Field(None, description="[DEPRECATED] Usar meta_config.business_account_id")


class TelegramConfig(BaseModel):
    """Configuración específica para Telegram"""
    bot_token: str = Field(..., description="Token del bot de Telegram")
    bot_username: Optional[str] = Field(None, description="Username del bot (@nombre)")
    webhook_secret: str = Field(default="", description="Secret para validar webhooks")


class WebConfig(BaseModel):
    """Configuración específica para canal Web (WebSocket)"""
    allowed_origins: Optional[list] = Field(None, description="Orígenes permitidos (CORS). None = todos.")


class PwaConfig(BaseModel):
    """Configuración para canal PWA (Progressive Web App + Push Notifications)"""
    allowed_origins: Optional[list] = Field(None, description="Orígenes permitidos (CORS). None = todos.")
    notification_icon: Optional[str] = Field(None, description="URL del icono para las notificaciones push")
    notification_badge: Optional[str] = Field(None, description="URL del badge para notificaciones (Android)")
    vapid_subject: Optional[str] = Field(None, description="mailto: o https: para VAPID (usa el global si no se especifica)")


class ChannelBase(BaseModel):
    """Modelo base de Channel"""
    bot_id: str = Field(..., description="ID del bot asociado")
    channel_type: ChannelType = Field(..., description="Tipo de canal: whatsapp, telegram o web")
    name: str = Field(..., min_length=2, max_length=100, description="Nombre identificador del canal")


class ChannelCreate(ChannelBase):
    """Modelo para crear un canal"""
    whatsapp_config: Optional[WhatsAppConfig] = None
    telegram_config: Optional[TelegramConfig] = None
    web_config: Optional[WebConfig] = None
    pwa_config: Optional[PwaConfig] = None
    webhook_url: Optional[str] = Field(None, description="URL del webhook (opcional, se genera automáticamente si no se proporciona)")


class ChannelUpdate(BaseModel):
    """Modelo para actualizar un canal"""
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    status: Optional[ChannelStatus] = None
    whatsapp_config: Optional[WhatsAppConfig] = None
    telegram_config: Optional[TelegramConfig] = None
    web_config: Optional[WebConfig] = None
    pwa_config: Optional[PwaConfig] = None
    webhook_url: Optional[str] = Field(None, description="URL del webhook personalizado")


class Channel(ChannelBase):
    """Modelo completo de Channel"""
    channel_id: str
    status: ChannelStatus = ChannelStatus.PENDING
    whatsapp_config: Optional[WhatsAppConfig] = None
    telegram_config: Optional[TelegramConfig] = None
    web_config: Optional[WebConfig] = None
    pwa_config: Optional[PwaConfig] = None
    webhook_url: Optional[str] = Field(None, description="URL del webhook / WebSocket configurado")
    created_at: str
    updated_at: str
    last_activity_at: Optional[str] = None
    total_messages_received: int = 0
    total_messages_sent: int = 0
    metadata: Optional[Dict] = None

    class Config:
        json_schema_extra = {
            "examples": [
                {
                    "channel_id": "channel_abc123",
                    "bot_id": "bot_123456",
                    "channel_type": "whatsapp",
                    "name": "WhatsApp Meta",
                    "status": "active",
                    "whatsapp_config": {
                        "provider": "meta",
                        "meta_config": {
                            "phone_number_id": "123456789",
                            "access_token": "EAAxxxxx",
                            "verify_token": "my_verify_token",
                            "api_version": "v21.0"
                        }
                    },
                    "webhook_url": "https://api.example.com/api/webhook/whatsapp/meta/channel_abc123",
                    "created_at": "2024-01-15T10:30:00Z",
                    "updated_at": "2024-01-15T10:30:00Z"
                },
                {
                    "channel_id": "channel_xyz789",
                    "bot_id": "bot_123456",
                    "channel_type": "whatsapp",
                    "name": "WhatsApp Twilio",
                    "status": "active",
                    "whatsapp_config": {
                        "provider": "twilio",
                        "twilio_config": {
                            "account_sid": "ACxxxxxxxx",
                            "auth_token": "your_auth_token",
                            "phone_number": "whatsapp:+14155238886"
                        }
                    },
                    "webhook_url": "https://api.example.com/api/webhook/whatsapp/twilio/channel_xyz789",
                    "created_at": "2024-01-15T10:30:00Z",
                    "updated_at": "2024-01-15T10:30:00Z"
                }
            ]
        }
