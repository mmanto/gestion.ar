"""
Channel Service - CRUD operations for channels in PostgreSQL (ver ADR-006 en docs/dev/DECISIONS.md)
"""

import os
import uuid
from typing import Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.db.database import AsyncSessionLocal
from app.db.models import Bot as BotModel, Channel as ChannelModel
from app.models.channel import (
    Channel,
    ChannelCreate,
    ChannelStatus,
    ChannelType,
    ChannelUpdate,
    WhatsAppProvider,
)


def _to_channel(row: ChannelModel) -> Channel:
    return Channel(
        channel_id=row.channel_id,
        bot_id=row.bot_id,
        channel_type=row.channel_type,
        name=row.name,
        owner_username=row.owner_username,
        status=row.status,
        whatsapp_config=row.whatsapp_config,
        telegram_config=row.telegram_config,
        web_config=row.web_config,
        pwa_config=row.pwa_config,
        webhook_url=row.webhook_url,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
        last_activity_at=row.last_activity_at.isoformat() if row.last_activity_at else None,
        total_messages_received=row.total_messages_received,
        total_messages_sent=row.total_messages_sent,
        metadata=row.metadata_,
    )


class ChannelService:
    """Servicio para gestionar canales en PostgreSQL"""

    async def ensure_indexes(self):
        """No-op: los índices ya se crean vía migraciones Alembic (ver backend/alembic/versions/)."""
        pass

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
            provider = "meta"  # Default
            if whatsapp_config:
                provider = whatsapp_config.provider.value if hasattr(whatsapp_config, 'provider') else "meta"
            return f"{base_url}/api/webhook/whatsapp/{provider}/{channel_id}"
        elif channel_type == ChannelType.TELEGRAM:
            return f"{base_url}/api/webhook/telegram/{channel_id}"
        elif channel_type == ChannelType.WEB:
            ws_base = base_url.replace("https://", "wss://").replace("http://", "ws://")
            return f"{ws_base}/ws/chat/channel/{channel_id}"
        elif channel_type == ChannelType.PWA:
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
        channel_id = f"channel_{uuid.uuid4().hex[:12]}"

        if channel_data.webhook_url:
            webhook_url = channel_data.webhook_url
        else:
            webhook_url = self._generate_webhook_url(
                channel_data.channel_type,
                channel_id,
                channel_data.whatsapp_config
            )

        async with AsyncSessionLocal() as session:
            # Resolver tenant_id desde el bot (requerido por la FK NOT NULL —
            # ver ClientService.create_client, mismo patrón).
            bot_result = await session.execute(
                select(BotModel.tenant_id).where(BotModel.bot_id == channel_data.bot_id)
            )
            tenant_id = bot_result.scalars().first()

            row = ChannelModel(
                channel_id=channel_id,
                bot_id=channel_data.bot_id,
                tenant_id=tenant_id,
                channel_type=channel_data.channel_type.value,
                name=channel_data.name,
                owner_username=channel_data.owner_username,
                status=ChannelStatus.PENDING.value,
                whatsapp_config=channel_data.whatsapp_config.model_dump() if channel_data.whatsapp_config else None,
                telegram_config=channel_data.telegram_config.model_dump() if channel_data.telegram_config else None,
                web_config=channel_data.web_config.model_dump() if channel_data.web_config else None,
                pwa_config=channel_data.pwa_config.model_dump() if channel_data.pwa_config else None,
                webhook_url=webhook_url,
                total_messages_received=0,
                total_messages_sent=0,
                metadata_={},
            )
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return _to_channel(row)

    async def get_channel(self, channel_id: str) -> Optional[Channel]:
        """Obtiene un canal por ID"""
        async with AsyncSessionLocal() as session:
            row = await session.get(ChannelModel, channel_id)
            return _to_channel(row) if row else None

    async def get_channels_by_bot(
        self,
        bot_id: str,
        skip: int = 0,
        limit: int = 20,
        channel_type: Optional[ChannelType] = None,
        status: Optional[ChannelStatus] = None
    ) -> Dict:
        """Obtiene canales de un bot con paginación"""
        filters = [ChannelModel.bot_id == bot_id]
        if channel_type:
            filters.append(ChannelModel.channel_type == channel_type.value)
        if status:
            filters.append(ChannelModel.status == status.value)

        async with AsyncSessionLocal() as session:
            total = (await session.execute(
                select(func.count()).select_from(ChannelModel).where(*filters)
            )).scalar_one()

            result = await session.execute(
                select(ChannelModel)
                .where(*filters)
                .order_by(ChannelModel.created_at.desc())
                .offset(skip)
                .limit(limit)
            )
            rows = result.scalars().all()

        return {
            "channels": [_to_channel(r) for r in rows],
            "total": total,
            "page": (skip // limit) + 1 if limit > 0 else 1,
            "pages": (total + limit - 1) // limit if limit > 0 else 0,
            "limit": limit
        }

    async def get_channel_by_type(self, bot_id: str, channel_type: ChannelType) -> Optional[Channel]:
        """Obtiene un canal específico de un bot por tipo"""
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(ChannelModel).where(
                    ChannelModel.bot_id == bot_id,
                    ChannelModel.channel_type == channel_type.value,
                )
            )
            row = result.scalars().first()
            return _to_channel(row) if row else None

    async def get_active_channel_by_type(self, bot_id: str, channel_type: ChannelType) -> Optional[Channel]:
        """Obtiene el canal activo de un bot por tipo"""
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(ChannelModel).where(
                    ChannelModel.bot_id == bot_id,
                    ChannelModel.channel_type == channel_type.value,
                    ChannelModel.status == ChannelStatus.ACTIVE.value,
                )
            )
            row = result.scalars().first()
            return _to_channel(row) if row else None

    async def update_channel(self, channel_id: str, update_data: ChannelUpdate) -> Optional[Channel]:
        """Actualiza un canal"""
        update_dict = {}
        for key, value in update_data.model_dump(exclude_unset=True).items():
            if key == "owner_username" and value == "":
                # "" es "desasignar" explícito (ver ChannelEditForm.tsx) — a
                # diferencia de otros campos, acá None también es un valor
                # válido a persistir, no solo "no tocar".
                update_dict["owner_username"] = None
                continue
            if value is None:
                continue
            if key == "status":
                update_dict["status"] = value.value if hasattr(value, "value") else value
            elif key == "metadata":
                update_dict["metadata_"] = value
            else:
                update_dict[key] = value

        async with AsyncSessionLocal() as session:
            row = await session.get(ChannelModel, channel_id)
            if not row:
                return None

            if not update_dict:
                return _to_channel(row)

            for k, v in update_dict.items():
                setattr(row, k, v)

            await session.commit()
            await session.refresh(row)
            return _to_channel(row)

    async def activate_channel(self, channel_id: str) -> bool:
        """Activa un canal"""
        async with AsyncSessionLocal() as session:
            row = await session.get(ChannelModel, channel_id)
            if not row:
                return False
            row.status = ChannelStatus.ACTIVE.value
            await session.commit()
            return True

    async def deactivate_channel(self, channel_id: str) -> bool:
        """Desactiva un canal"""
        async with AsyncSessionLocal() as session:
            row = await session.get(ChannelModel, channel_id)
            if not row:
                return False
            row.status = ChannelStatus.INACTIVE.value
            await session.commit()
            return True

    async def delete_channel(self, channel_id: str) -> bool:
        """Elimina un canal"""
        async with AsyncSessionLocal() as session:
            row = await session.get(ChannelModel, channel_id)
            if not row:
                return False
            await session.delete(row)
            await session.commit()
            return True

    async def increment_message_counters(
        self,
        channel_id: str,
        received: int = 0,
        sent: int = 0
    ):
        """Incrementa contadores de mensajes del canal"""
        from datetime import datetime, timezone

        async with AsyncSessionLocal() as session:
            row = await session.get(ChannelModel, channel_id)
            if not row:
                return
            if received:
                row.total_messages_received += received
            if sent:
                row.total_messages_sent += sent
            row.last_activity_at = datetime.now(timezone.utc)
            await session.commit()

    async def set_channel_error(self, channel_id: str, error_message: str):
        """Marca un canal con error"""
        from datetime import datetime, timezone

        async with AsyncSessionLocal() as session:
            row = await session.get(ChannelModel, channel_id)
            if not row:
                return
            metadata = dict(row.metadata_ or {})
            metadata["last_error"] = error_message
            metadata["error_at"] = datetime.now(timezone.utc).isoformat()
            row.status = ChannelStatus.ERROR.value
            row.metadata_ = metadata
            await session.commit()

    async def get_channel_by_twilio_phone(self, phone_number: str) -> Optional[Channel]:
        """
        Busca un canal de WhatsApp por número de teléfono de Twilio.

        Args:
            phone_number: Número en formato "whatsapp:+1234567890" o "+1234567890"

        Returns:
            Canal encontrado o None
        """
        normalized = phone_number.replace(" ", "")
        digits = ''.join(c for c in normalized if c.isdigit())
        if digits:
            normalized = f"whatsapp:+{digits}"

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(ChannelModel).where(
                    ChannelModel.channel_type == ChannelType.WHATSAPP.value,
                    ChannelModel.whatsapp_config["provider"].astext == WhatsAppProvider.TWILIO.value,
                    ChannelModel.whatsapp_config["twilio_config"]["phone_number"].astext == normalized,
                )
            )
            row = result.scalars().first()
            if row:
                return _to_channel(row)

            plain_number = f"+{digits}"
            result = await session.execute(
                select(ChannelModel).where(
                    ChannelModel.channel_type == ChannelType.WHATSAPP.value,
                    ChannelModel.whatsapp_config["provider"].astext == WhatsAppProvider.TWILIO.value,
                    ChannelModel.whatsapp_config["twilio_config"]["phone_number"].astext == plain_number,
                )
            )
            row = result.scalars().first()
            return _to_channel(row) if row else None

    async def get_or_create_owner_web_channel(
        self,
        bot_id: str,
        owner_username: str,
        name: str,
    ) -> Channel:
        """
        Devuelve el canal web de (bot_id, owner_username), creándolo si no existe.

        Idempotente ante carreras concurrentes: si el INSERT choca contra
        `uq_channels_bot_owner_web`, se asume que otro request ganó la carrera
        y se relee la fila ya existente en vez de propagar el error.
        """
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(ChannelModel).where(
                    ChannelModel.bot_id == bot_id,
                    ChannelModel.owner_username == owner_username,
                    ChannelModel.channel_type == ChannelType.WEB.value,
                )
            )
            row = result.scalars().first()
            if row:
                return _to_channel(row)

        try:
            return await self.create_channel(
                ChannelCreate(
                    bot_id=bot_id,
                    channel_type=ChannelType.WEB,
                    name=name,
                    owner_username=owner_username,
                )
            )
        except IntegrityError:
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(ChannelModel).where(
                        ChannelModel.bot_id == bot_id,
                        ChannelModel.owner_username == owner_username,
                        ChannelModel.channel_type == ChannelType.WEB.value,
                    )
                )
                row = result.scalars().first()
                return _to_channel(row)

    async def get_active_web_channels_by_owner(
        self, bot_ids: List[str], owner_username: str
    ) -> Dict[str, Channel]:
        """
        Trae los canales web ACTIVOS de un owner entre varios bots.

        Returns:
            Dict bot_id -> Channel (a lo sumo un canal web por bot, ver
            uq_channels_bot_owner_web).
        """
        if not bot_ids:
            return {}

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(ChannelModel).where(
                    ChannelModel.bot_id.in_(bot_ids),
                    ChannelModel.owner_username == owner_username,
                    ChannelModel.channel_type == ChannelType.WEB.value,
                    ChannelModel.status == ChannelStatus.ACTIVE.value,
                )
            )
            rows = result.scalars().all()

        return {row.bot_id: _to_channel(row) for row in rows}

    async def get_channel_by_telegram_token(self, bot_token: str) -> Optional[Channel]:
        """
        Busca un canal de Telegram por bot_token.

        Usado por el webhook legacy /api/webhook/telegram (sin channel_id en la
        URL, un solo bot global vía TELEGRAM_BOT_TOKEN) para resolver a qué
        agente pertenece, si ese token coincide con el de algún canal configurado.

        Returns:
            Canal encontrado o None
        """
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(ChannelModel).where(
                    ChannelModel.channel_type == ChannelType.TELEGRAM.value,
                    ChannelModel.telegram_config["bot_token"].astext == bot_token,
                )
            )
            row = result.scalars().first()
            return _to_channel(row) if row else None


# Singleton
_channel_service: Optional[ChannelService] = None


def get_channel_service() -> ChannelService:
    """Obtiene la instancia singleton del servicio de canales"""
    global _channel_service
    if _channel_service is None:
        _channel_service = ChannelService()
    return _channel_service
