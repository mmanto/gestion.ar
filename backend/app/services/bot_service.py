"""
Bot Service - CRUD operations for bots in MongoDB
"""

import os
import uuid
from datetime import datetime
from typing import Dict, Optional

from motor.motor_asyncio import AsyncIOMotorClient

from app.models.bot import Bot, BotCreate, BotUpdate, BotStatus, BotConfig


class BotService:
    """Servicio para gestionar bots en MongoDB"""

    def __init__(self):
        """Inicializa el servicio de bots"""
        self.mongodb_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017/gestionar")
        self.client = AsyncIOMotorClient(self.mongodb_uri)
        self.db = self.client.get_default_database()
        self.bots = self.db.bots
        print("Bot Service inicializado")

    async def ensure_indexes(self):
        """Crea los índices necesarios en la colección"""
        await self.bots.create_index("bot_id", unique=True)
        await self.bots.create_index("owner_id")
        await self.bots.create_index("status")
        await self.bots.create_index("created_at")

    async def create_bot(self, bot_data: BotCreate, owner_id: str) -> Bot:
        """
        Crea un nuevo bot

        Args:
            bot_data: Datos para crear el bot
            owner_id: ID del usuario propietario

        Returns:
            Bot creado
        """
        timestamp = datetime.utcnow().isoformat()
        bot_id = f"bot_{uuid.uuid4().hex[:12]}"

        config = bot_data.config if bot_data.config else BotConfig()
        channels = bot_data.channels if bot_data.channels else []

        bot_dict = {
            "bot_id": bot_id,
            "name": bot_data.name,
            "description": bot_data.description,
            "business_type": bot_data.business_type,
            "owner_id": owner_id,
            "status": BotStatus.ACTIVE.value,
            "config": config.model_dump(),
            "channels": [c.model_dump() for c in channels],
            "channel_ids": [],
            "knowledge_base_id": None,
            "created_at": timestamp,
            "updated_at": timestamp,
            "total_clients": 0,
            "total_conversations": 0,
            "total_messages": 0,
            "metadata": {}
        }

        await self.bots.insert_one(bot_dict)
        return Bot(**bot_dict)

    async def get_bot(self, bot_id: str) -> Optional[Bot]:
        """Obtiene un bot por ID"""
        bot = await self.bots.find_one({"bot_id": bot_id}, {"_id": 0})
        return Bot(**bot) if bot else None

    async def get_bot_by_owner(self, bot_id: str, owner_id: str) -> Optional[Bot]:
        """Obtiene un bot verificando que pertenezca al owner"""
        bot = await self.bots.find_one(
            {"bot_id": bot_id, "owner_id": owner_id},
            {"_id": 0}
        )
        return Bot(**bot) if bot else None

    async def get_bots_by_owner(
        self,
        owner_id: str,
        skip: int = 0,
        limit: int = 20,
        status: Optional[BotStatus] = None
    ) -> Dict:
        """Obtiene bots de un propietario con paginación"""
        filter_query = {"owner_id": owner_id}
        if status:
            filter_query["status"] = status.value

        total = await self.bots.count_documents(filter_query)
        cursor = self.bots.find(
            filter_query,
            {"_id": 0}
        ).sort("created_at", -1).skip(skip).limit(limit)

        bots = await cursor.to_list(length=limit)

        return {
            "bots": [Bot(**b) for b in bots],
            "total": total,
            "page": (skip // limit) + 1,
            "pages": (total + limit - 1) // limit if limit > 0 else 0,
            "limit": limit
        }

    async def update_bot(self, bot_id: str, owner_id: str, update_data: BotUpdate) -> Optional[Bot]:
        """Actualiza un bot"""
        update_dict = {}

        for key, value in update_data.model_dump(exclude_unset=True).items():
            if value is not None:
                if key == "config" and isinstance(value, dict):
                    update_dict["config"] = value
                elif key == "channels" and isinstance(value, list):
                    update_dict["channels"] = value
                elif key == "status":
                    update_dict["status"] = value.value if hasattr(value, 'value') else value
                else:
                    update_dict[key] = value

        if not update_dict:
            return await self.get_bot_by_owner(bot_id, owner_id)

        update_dict["updated_at"] = datetime.utcnow().isoformat()

        result = await self.bots.update_one(
            {"bot_id": bot_id, "owner_id": owner_id},
            {"$set": update_dict}
        )

        if result.matched_count > 0:
            return await self.get_bot(bot_id)
        return None

    async def delete_bot(self, bot_id: str, owner_id: str) -> bool:
        """Elimina un bot (soft delete)"""
        result = await self.bots.update_one(
            {"bot_id": bot_id, "owner_id": owner_id},
            {
                "$set": {
                    "status": BotStatus.INACTIVE.value,
                    "updated_at": datetime.utcnow().isoformat()
                }
            }
        )
        return result.modified_count > 0

    async def get_bot_stats(self, bot_id: str) -> Dict:
        """Obtiene estadísticas de un bot"""
        bot = await self.get_bot(bot_id)
        if not bot:
            return {}

        return {
            "bot_id": bot_id,
            "total_clients": bot.total_clients,
            "total_conversations": bot.total_conversations,
            "total_messages": bot.total_messages,
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
        update_fields = {"updated_at": datetime.utcnow().isoformat()}
        inc_fields = {}

        if clients != 0:
            inc_fields["total_clients"] = clients
        if conversations != 0:
            inc_fields["total_conversations"] = conversations
        if messages != 0:
            inc_fields["total_messages"] = messages

        update_query = {"$set": update_fields}
        if inc_fields:
            update_query["$inc"] = inc_fields

        await self.bots.update_one(
            {"bot_id": bot_id},
            update_query
        )

    async def add_channel_to_bot(self, bot_id: str, channel_id: str) -> bool:
        """Agrega un canal al bot"""
        result = await self.bots.update_one(
            {"bot_id": bot_id},
            {
                "$addToSet": {"channel_ids": channel_id},
                "$set": {"updated_at": datetime.utcnow().isoformat()}
            }
        )
        return result.modified_count > 0

    async def remove_channel_from_bot(self, bot_id: str, channel_id: str) -> bool:
        """Elimina un canal del bot"""
        result = await self.bots.update_one(
            {"bot_id": bot_id},
            {
                "$pull": {"channel_ids": channel_id},
                "$set": {"updated_at": datetime.utcnow().isoformat()}
            }
        )
        return result.modified_count > 0


# Singleton
_bot_service: Optional[BotService] = None


def get_bot_service() -> BotService:
    """Obtiene la instancia singleton del servicio de bots"""
    global _bot_service
    if _bot_service is None:
        _bot_service = BotService()
    return _bot_service
