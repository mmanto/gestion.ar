"""
Channel Service - CRUD operations for channels in MongoDB
"""

import os
import uuid
from datetime import datetime
from typing import Dict, Optional

from motor.motor_asyncio import AsyncIOMotorClient

from app.models.channel import (
    Channel,
    ChannelCreate,
    ChannelUpdate,
    ChannelStatus,
    ChannelType,
    WhatsAppProvider,
)


class ChannelService:
    """Servicio para gestionar canales en MongoDB"""

    def __init__(self):
        """Inicializa el servicio de canales"""
        self.mongodb_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017/leadtrackers")
        self.client = AsyncIOMotorClient(self.mongodb_uri)
        self.db = self.client.get_default_database()
        self.channels = self.db.channels
        print("Channel Service inicializado")

    async def ensure_indexes(self):
        """Crea los índices necesarios en la colección"""
        await self.channels.create_index("channel_id", unique=True)
        await self.channels.create_index("bot_id")
        await self.channels.create_index([("bot_id", 1), ("channel_type", 1)])
        await self.channels.create_index("status")
        # Índice para búsqueda por número de teléfono (Twilio)
        await self.channels.create_index("whatsapp_config.twilio_config.phone_number")

    def _generate_webhook_url(
        self,
        channel_type: ChannelType,
        channel_id: str,
        whatsapp_config=None
    ) -> str:
        """
        Genera la URL del webhook según el tipo de canal y proveedor.

        Args:
            channel_type: Tipo de canal
            channel_id: ID del canal
            whatsapp_config: Configuración de WhatsApp (opcional)

        Returns:
            URL del webhook
        """
        base_url = os.getenv("WEBHOOK_BASE_URL", "https://api.example.com")

        if channel_type == ChannelType.WHATSAPP:
            # Determinar el proveedor de WhatsApp
            provider = "meta"  # Default
            if whatsapp_config:
                provider = whatsapp_config.provider.value if hasattr(whatsapp_config, 'provider') else "meta"
            return f"{base_url}/api/webhook/whatsapp/{provider}/{channel_id}"
        elif channel_type == ChannelType.TELEGRAM:
            return f"{base_url}/api/webhook/telegram/{channel_id}"
        elif channel_type == ChannelType.WEB:
            # El canal web usa WebSocket — la URL de conexión
            ws_base = base_url.replace("https://", "wss://").replace("http://", "ws://")
            return f"{ws_base}/ws/chat/channel/{channel_id}"
        elif channel_type == ChannelType.PWA:
            # El canal PWA usa WebSocket + Push Notifications — URL pública del chat
            ws_base = base_url.replace("https://", "wss://").replace("http://", "ws://")
            return f"{ws_base}/ws/chat/channel/{channel_id}"
        else:
            return f"{base_url}/api/webhook/{channel_type.value}/{channel_id}"

    async def create_channel(self, channel_data: ChannelCreate) -> Channel:
        """
        Crea un nuevo canal

        Args:
            channel_data: Datos para crear el canal

        Returns:
            Channel creado
        """
        timestamp = datetime.utcnow().isoformat()
        channel_id = f"channel_{uuid.uuid4().hex[:12]}"

        # Usar webhook personalizado si se proporciona, o generar uno automáticamente
        if channel_data.webhook_url:
            webhook_url = channel_data.webhook_url
        else:
            webhook_url = self._generate_webhook_url(
                channel_data.channel_type,
                channel_id,
                channel_data.whatsapp_config
            )

        channel_dict = {
            "channel_id": channel_id,
            "bot_id": channel_data.bot_id,
            "channel_type": channel_data.channel_type.value,
            "name": channel_data.name,
            "status": ChannelStatus.PENDING.value,
            "whatsapp_config": channel_data.whatsapp_config.model_dump() if channel_data.whatsapp_config else None,
            "telegram_config": channel_data.telegram_config.model_dump() if channel_data.telegram_config else None,
            "web_config": channel_data.web_config.model_dump() if channel_data.web_config else None,
            "webhook_url": webhook_url,
            "created_at": timestamp,
            "updated_at": timestamp,
            "last_activity_at": None,
            "total_messages_received": 0,
            "total_messages_sent": 0,
            "metadata": {}
        }

        await self.channels.insert_one(channel_dict)
        return Channel(**channel_dict)

    async def get_channel(self, channel_id: str) -> Optional[Channel]:
        """Obtiene un canal por ID"""
        channel = await self.channels.find_one({"channel_id": channel_id}, {"_id": 0})
        return Channel(**channel) if channel else None

    async def get_channels_by_bot(
        self,
        bot_id: str,
        skip: int = 0,
        limit: int = 20,
        channel_type: Optional[ChannelType] = None,
        status: Optional[ChannelStatus] = None
    ) -> Dict:
        """Obtiene canales de un bot con paginación"""
        filter_query = {"bot_id": bot_id}

        if channel_type:
            filter_query["channel_type"] = channel_type.value
        if status:
            filter_query["status"] = status.value

        total = await self.channels.count_documents(filter_query)
        cursor = self.channels.find(
            filter_query,
            {"_id": 0}
        ).sort("created_at", -1).skip(skip).limit(limit)

        channels = await cursor.to_list(length=limit)

        return {
            "channels": [Channel(**c) for c in channels],
            "total": total,
            "page": (skip // limit) + 1 if limit > 0 else 1,
            "pages": (total + limit - 1) // limit if limit > 0 else 0,
            "limit": limit
        }

    async def get_channel_by_type(self, bot_id: str, channel_type: ChannelType) -> Optional[Channel]:
        """Obtiene un canal específico de un bot por tipo"""
        channel = await self.channels.find_one(
            {"bot_id": bot_id, "channel_type": channel_type.value},
            {"_id": 0}
        )
        return Channel(**channel) if channel else None

    async def get_active_channel_by_type(self, bot_id: str, channel_type: ChannelType) -> Optional[Channel]:
        """Obtiene el canal activo de un bot por tipo"""
        channel = await self.channels.find_one(
            {
                "bot_id": bot_id,
                "channel_type": channel_type.value,
                "status": ChannelStatus.ACTIVE.value
            },
            {"_id": 0}
        )
        return Channel(**channel) if channel else None

    async def update_channel(self, channel_id: str, update_data: ChannelUpdate) -> Optional[Channel]:
        """Actualiza un canal"""
        update_dict = {}

        for key, value in update_data.model_dump(exclude_unset=True).items():
            if value is not None:
                if key == "status":
                    update_dict["status"] = value.value if hasattr(value, 'value') else value
                elif key in ["whatsapp_config", "telegram_config"] and isinstance(value, dict):
                    update_dict[key] = value
                else:
                    update_dict[key] = value

        if not update_dict:
            return await self.get_channel(channel_id)

        update_dict["updated_at"] = datetime.utcnow().isoformat()

        result = await self.channels.update_one(
            {"channel_id": channel_id},
            {"$set": update_dict}
        )

        if result.matched_count > 0:
            return await self.get_channel(channel_id)
        return None

    async def activate_channel(self, channel_id: str) -> bool:
        """Activa un canal"""
        result = await self.channels.update_one(
            {"channel_id": channel_id},
            {
                "$set": {
                    "status": ChannelStatus.ACTIVE.value,
                    "updated_at": datetime.utcnow().isoformat()
                }
            }
        )
        return result.modified_count > 0

    async def deactivate_channel(self, channel_id: str) -> bool:
        """Desactiva un canal"""
        result = await self.channels.update_one(
            {"channel_id": channel_id},
            {
                "$set": {
                    "status": ChannelStatus.INACTIVE.value,
                    "updated_at": datetime.utcnow().isoformat()
                }
            }
        )
        return result.modified_count > 0

    async def delete_channel(self, channel_id: str) -> bool:
        """Elimina un canal"""
        result = await self.channels.delete_one({"channel_id": channel_id})
        return result.deleted_count > 0

    async def increment_message_counters(
        self,
        channel_id: str,
        received: int = 0,
        sent: int = 0
    ):
        """Incrementa contadores de mensajes del canal"""
        update_fields = {
            "updated_at": datetime.utcnow().isoformat(),
            "last_activity_at": datetime.utcnow().isoformat()
        }
        inc_fields = {}

        if received != 0:
            inc_fields["total_messages_received"] = received
        if sent != 0:
            inc_fields["total_messages_sent"] = sent

        update_query = {"$set": update_fields}
        if inc_fields:
            update_query["$inc"] = inc_fields

        await self.channels.update_one(
            {"channel_id": channel_id},
            update_query
        )

    async def set_channel_error(self, channel_id: str, error_message: str):
        """Marca un canal con error"""
        await self.channels.update_one(
            {"channel_id": channel_id},
            {
                "$set": {
                    "status": ChannelStatus.ERROR.value,
                    "updated_at": datetime.utcnow().isoformat(),
                    "metadata.last_error": error_message,
                    "metadata.error_at": datetime.utcnow().isoformat()
                }
            }
        )

    async def get_channel_by_twilio_phone(self, phone_number: str) -> Optional[Channel]:
        """
        Busca un canal de WhatsApp por número de teléfono de Twilio.

        Args:
            phone_number: Número en formato "whatsapp:+1234567890" o "+1234567890"

        Returns:
            Canal encontrado o None
        """
        # Normalizar el número: eliminar espacios y asegurar formato whatsapp:+xxx
        normalized = phone_number.replace(" ", "")

        # Extraer solo los dígitos del número
        digits = ''.join(c for c in normalized if c.isdigit())

        # Reconstruir en formato estándar
        if digits:
            normalized = f"whatsapp:+{digits}"

        # Buscar por número exacto
        channel = await self.channels.find_one(
            {
                "channel_type": ChannelType.WHATSAPP.value,
                "whatsapp_config.provider": WhatsAppProvider.TWILIO.value,
                "whatsapp_config.twilio_config.phone_number": normalized
            },
            {"_id": 0}
        )

        if channel:
            return Channel(**channel)

        # Intentar sin el prefijo whatsapp:
        plain_number = f"+{digits}"
        channel = await self.channels.find_one(
            {
                "channel_type": ChannelType.WHATSAPP.value,
                "whatsapp_config.provider": WhatsAppProvider.TWILIO.value,
                "whatsapp_config.twilio_config.phone_number": plain_number
            },
            {"_id": 0}
        )
        if channel:
            return Channel(**channel)

        return None


# Singleton
_channel_service: Optional[ChannelService] = None


def get_channel_service() -> ChannelService:
    """Obtiene la instancia singleton del servicio de canales"""
    global _channel_service
    if _channel_service is None:
        _channel_service = ChannelService()
    return _channel_service
