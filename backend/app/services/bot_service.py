"""
Bot Service - CRUD operations for bots in PostgreSQL (ver ADR-006 en docs/dev/DECISIONS.md)
"""

import uuid
from typing import Dict, Optional

from sqlalchemy import func, select

from app.db.database import AsyncSessionLocal
from app.db.models import Bot as BotModel
from app.db.models import Conversation as ConversationModel
from app.models.bot import Bot, BotConfig, BotCreate, BotStatus, BotUpdate


def _to_bot(row: BotModel) -> Bot:
    return Bot(
        bot_id=row.bot_id,
        owner_id=row.owner_id,
        tenant_id=row.tenant_id,
        name=row.name,
        description=row.description,
        business_type=row.business_type,
        status=row.status,
        config=row.config,
        channel_ids=row.channel_ids or [],
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
        total_clients=row.total_clients,
        total_conversations=row.total_conversations,
        total_messages=row.total_messages,
        metadata=row.metadata_,
    )


class BotService:
    """Servicio para gestionar bots en PostgreSQL"""

    async def ensure_indexes(self):
        """No-op: los índices ya se crean vía migraciones Alembic (ver backend/alembic/versions/)."""
        pass

    async def create_bot(self, bot_data: BotCreate, owner_id: str, tenant_id: str) -> Bot:
        """
        Crea un nuevo bot

        Args:
            bot_data: Datos para crear el bot
            owner_id: Usuario de administración general que lo configura
            tenant_id: Tenant al que pertenece el bot

        Returns:
            Bot creado
        """
        bot_id = f"bot_{uuid.uuid4().hex[:12]}"
        config = bot_data.config if bot_data.config else BotConfig()

        async with AsyncSessionLocal() as session:
            row = BotModel(
                bot_id=bot_id,
                owner_id=owner_id,
                tenant_id=tenant_id,
                name=bot_data.name,
                description=bot_data.description,
                business_type=bot_data.business_type,
                status=BotStatus.ACTIVE.value,
                config=config.model_dump(),
                channel_ids=[],
                total_clients=0,
                total_conversations=0,
                total_messages=0,
                metadata_={},
            )
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return _to_bot(row)

    async def get_bot(self, bot_id: str) -> Optional[Bot]:
        """Obtiene un bot por ID"""
        async with AsyncSessionLocal() as session:
            row = await session.get(BotModel, bot_id)
            return _to_bot(row) if row else None

    async def get_bot_by_owner(self, bot_id: str, owner_id: str) -> Optional[Bot]:
        """Obtiene un bot verificando que pertenezca al owner"""
        async with AsyncSessionLocal() as session:
            row = await session.get(BotModel, bot_id)
            if row and row.owner_id == owner_id:
                return _to_bot(row)
            return None

    async def get_bots_by_owner(
        self,
        owner_id: str,
        skip: int = 0,
        limit: int = 20,
        status: Optional[BotStatus] = None
    ) -> Dict:
        """Obtiene bots de un propietario con paginación"""
        filters = [BotModel.owner_id == owner_id]
        if status:
            filters.append(BotModel.status == status.value)

        async with AsyncSessionLocal() as session:
            total = (await session.execute(
                select(func.count()).select_from(BotModel).where(*filters)
            )).scalar_one()

            result = await session.execute(
                select(BotModel)
                .where(*filters)
                .order_by(BotModel.created_at.desc())
                .offset(skip)
                .limit(limit)
            )
            rows = result.scalars().all()

        return {
            "bots": [_to_bot(r) for r in rows],
            "total": total,
            "page": (skip // limit) + 1 if limit > 0 else 1,
            "pages": (total + limit - 1) // limit if limit > 0 else 0,
            "limit": limit
        }

    async def get_bots_by_tenant(
        self,
        tenant_id: Optional[str],
        skip: int = 0,
        limit: int = 20,
        status: Optional[BotStatus] = None
    ) -> Dict:
        """Obtiene bots de un tenant con paginación (scoping real del modelo
        multi-tenant — ver estrategia multi-tenant, Fase 4). `tenant_id=None`
        (super_admin sin tenant propio) siempre resuelve a "sin bots": los
        datos operativos de tenants no son parte del alcance de super_admin."""
        if tenant_id is None:
            return {"bots": [], "total": 0, "page": 1, "pages": 0, "limit": limit}

        filters = [BotModel.tenant_id == tenant_id]
        if status:
            filters.append(BotModel.status == status.value)

        async with AsyncSessionLocal() as session:
            total = (await session.execute(
                select(func.count()).select_from(BotModel).where(*filters)
            )).scalar_one()

            result = await session.execute(
                select(BotModel)
                .where(*filters)
                .order_by(BotModel.created_at.desc())
                .offset(skip)
                .limit(limit)
            )
            rows = result.scalars().all()

        return {
            "bots": [_to_bot(r) for r in rows],
            "total": total,
            "page": (skip // limit) + 1 if limit > 0 else 1,
            "pages": (total + limit - 1) // limit if limit > 0 else 0,
            "limit": limit
        }

    async def list_all_bots(
        self, skip: int = 0, limit: int = 20, status: Optional[BotStatus] = None
    ) -> Dict:
        """Lista todos los bots de todos los tenants (uso exclusivo de
        administración general — ver estrategia multi-tenant)."""
        filters = []
        if status:
            filters.append(BotModel.status == status.value)

        async with AsyncSessionLocal() as session:
            total = (await session.execute(
                select(func.count()).select_from(BotModel).where(*filters)
            )).scalar_one()

            result = await session.execute(
                select(BotModel)
                .where(*filters)
                .order_by(BotModel.created_at.desc())
                .offset(skip)
                .limit(limit)
            )
            rows = result.scalars().all()

        return {
            "bots": [_to_bot(r) for r in rows],
            "total": total,
            "page": (skip // limit) + 1 if limit > 0 else 1,
            "pages": (total + limit - 1) // limit if limit > 0 else 0,
            "limit": limit
        }

    async def update_bot_admin(self, bot_id: str, update_data: BotUpdate) -> Optional[Bot]:
        """Actualiza un bot (configuración técnica — sólo administración general)"""
        update_dict = {}

        for key, value in update_data.model_dump(exclude_unset=True).items():
            if value is None:
                continue
            if key == "channels":
                # legacy, ya no se persiste (estaba siempre vacío en la práctica)
                continue
            if key == "config" and isinstance(value, dict):
                update_dict["config"] = value
            elif key == "status":
                update_dict["status"] = value.value if hasattr(value, "value") else value
            elif key == "metadata":
                update_dict["metadata_"] = value
            else:
                update_dict[key] = value

        async with AsyncSessionLocal() as session:
            row = await session.get(BotModel, bot_id)
            if not row:
                return None

            if not update_dict:
                return _to_bot(row)

            for k, v in update_dict.items():
                setattr(row, k, v)

            await session.commit()
            await session.refresh(row)
            return _to_bot(row)

    async def delete_bot_admin(self, bot_id: str) -> bool:
        """Elimina un bot (soft delete, sólo administración general)"""
        async with AsyncSessionLocal() as session:
            row = await session.get(BotModel, bot_id)
            if not row:
                return False
            row.status = BotStatus.INACTIVE.value
            await session.commit()
            return True

    async def get_bot_stats(self, bot_id: str) -> Dict:
        """Obtiene estadísticas de un bot"""
        bot = await self.get_bot(bot_id)
        if not bot:
            return {}

        async with AsyncSessionLocal() as session:
            total_tokens_used = (await session.execute(
                select(func.coalesce(func.sum(ConversationModel.total_tokens_used), 0))
                .where(ConversationModel.bot_id == bot_id)
            )).scalar_one()

        return {
            "bot_id": bot_id,
            "total_clients": bot.total_clients,
            "total_conversations": bot.total_conversations,
            "total_messages": bot.total_messages,
            "total_tokens_used": total_tokens_used,
            "status": bot.status,
            "created_at": bot.created_at,
            "updated_at": bot.updated_at
        }

    async def increment_counters(
        self,
        bot_id: str,
        clients: int = 0,
        conversations: int = 0,
        messages: int = 0
    ):
        """Incrementa contadores del bot"""
        async with AsyncSessionLocal() as session:
            row = await session.get(BotModel, bot_id)
            if not row:
                return
            if clients:
                row.total_clients += clients
            if conversations:
                row.total_conversations += conversations
            if messages:
                row.total_messages += messages
            await session.commit()

    async def add_channel_to_bot(self, bot_id: str, channel_id: str) -> bool:
        """Agrega un canal al bot"""
        async with AsyncSessionLocal() as session:
            row = await session.get(BotModel, bot_id)
            if not row:
                return False
            channel_ids = list(row.channel_ids or [])
            if channel_id in channel_ids:
                return False
            channel_ids.append(channel_id)
            row.channel_ids = channel_ids
            await session.commit()
            return True

    async def remove_channel_from_bot(self, bot_id: str, channel_id: str) -> bool:
        """Elimina un canal del bot"""
        async with AsyncSessionLocal() as session:
            row = await session.get(BotModel, bot_id)
            if not row:
                return False
            channel_ids = list(row.channel_ids or [])
            if channel_id not in channel_ids:
                return False
            channel_ids.remove(channel_id)
            row.channel_ids = channel_ids
            await session.commit()
            return True


# Singleton
_bot_service: Optional[BotService] = None


def get_bot_service() -> BotService:
    """Obtiene la instancia singleton del servicio de bots"""
    global _bot_service
    if _bot_service is None:
        _bot_service = BotService()
    return _bot_service
