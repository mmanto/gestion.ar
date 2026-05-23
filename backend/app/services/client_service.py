"""
Client Service - CRUD operations for clients in MongoDB
"""

import math
import os
import uuid
from datetime import datetime
from typing import Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorClient

from app.models.client import Client, ClientCreate, ClientUpdate, ClientStatus, ClientSource


def calculate_score(total_messages: int, first_contact_at: str) -> float:
    """
    Calcula el score del cliente (0-100) basado en:
    - Mensajes totales (0-60 pts): logarítmico, satura en ~1000 mensajes
    - Frecuencia de contacto (0-40 pts): mensajes/día, satura en 10 msgs/día
    """
    msg_score = min(60.0, math.log10(total_messages + 1) / 3.0 * 60.0)

    try:
        first_dt = datetime.fromisoformat(first_contact_at)
        days = max(1, (datetime.utcnow() - first_dt).days + 1)
    except (ValueError, TypeError):
        days = 1

    msgs_per_day = total_messages / days
    freq_score = min(40.0, msgs_per_day / 10.0 * 40.0)

    return round(msg_score + freq_score, 2)


class ClientService:
    """Servicio para gestionar clientes en MongoDB"""

    def __init__(self):
        """Inicializa el servicio de clientes"""
        self.mongodb_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017/leadtrackers")
        self.client = AsyncIOMotorClient(self.mongodb_uri)
        self.db = self.client.get_default_database()
        self.clients = self.db.clients
        print("Client Service inicializado")

    async def ensure_indexes(self):
        """Crea los índices necesarios en la colección"""
        await self.clients.create_index("client_id", unique=True)
        await self.clients.create_index([("bot_id", 1), ("external_id", 1)], unique=True)
        await self.clients.create_index([("bot_id", 1), ("status", 1)])
        await self.clients.create_index("last_contact_at")
        await self.clients.create_index([("score", -1)])

    async def create_client(self, client_data: ClientCreate) -> Client:
        """Crea un nuevo cliente"""
        timestamp = datetime.utcnow().isoformat()
        client_id = f"client_{uuid.uuid4().hex[:12]}"

        client_dict = {
            "client_id": client_id,
            "bot_id": client_data.bot_id,
            "external_id": client_data.external_id,
            "source": client_data.source.value if hasattr(client_data.source, 'value') else client_data.source,
            "name": client_data.name,
            "email": client_data.email,
            "phone": client_data.phone,
            "status": ClientStatus.ACTIVE.value,
            "first_contact_at": timestamp,
            "last_contact_at": timestamp,
            "total_conversations": 0,
            "total_messages": 0,
            "total_tokens_used": 0,
            "score": 0.0,
            "metadata": client_data.metadata or {}
        }

        await self.clients.insert_one(client_dict)
        return Client(**client_dict)

    async def get_client(self, client_id: str) -> Optional[Client]:
        """Obtiene un cliente por ID"""
        client = await self.clients.find_one({"client_id": client_id}, {"_id": 0})
        return Client(**client) if client else None

    async def get_client_by_external_id(
        self,
        bot_id: str,
        external_id: str
    ) -> Optional[Client]:
        """Obtiene cliente por bot_id y external_id"""
        client = await self.clients.find_one(
            {"bot_id": bot_id, "external_id": external_id},
            {"_id": 0}
        )
        return Client(**client) if client else None

    async def get_or_create_client(
        self,
        bot_id: str,
        external_id: str,
        source: str,
        metadata: Optional[Dict] = None
    ) -> Client:
        """Obtiene o crea un cliente"""
        existing = await self.get_client_by_external_id(bot_id, external_id)
        if existing:
            # Actualizar last_contact_at
            await self.clients.update_one(
                {"client_id": existing.client_id},
                {"$set": {"last_contact_at": datetime.utcnow().isoformat()}}
            )
            # Re-fetch para obtener el timestamp actualizado
            return await self.get_client(existing.client_id)

        # Crear nuevo cliente
        source_enum = ClientSource(source) if source in [e.value for e in ClientSource] else ClientSource.MANUAL
        client_data = ClientCreate(
            bot_id=bot_id,
            external_id=external_id,
            source=source_enum,
            metadata=metadata
        )
        return await self.create_client(client_data)

    async def get_clients_by_bot(
        self,
        bot_id: str,
        skip: int = 0,
        limit: int = 20,
        status: Optional[ClientStatus] = None,
        search: Optional[str] = None
    ) -> Dict:
        """Obtiene clientes de un bot con paginación y filtros"""
        filter_query = {"bot_id": bot_id}

        if status:
            filter_query["status"] = status.value

        if search:
            filter_query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"external_id": {"$regex": search, "$options": "i"}},
                {"email": {"$regex": search, "$options": "i"}},
                {"phone": {"$regex": search, "$options": "i"}}
            ]

        total = await self.clients.count_documents(filter_query)
        cursor = self.clients.find(
            filter_query,
            {"_id": 0}
        ).sort([("score", -1), ("last_contact_at", -1)]).skip(skip).limit(limit)

        clients = await cursor.to_list(length=limit)

        return {
            "clients": [Client(**c) for c in clients],
            "total": total,
            "page": (skip // limit) + 1,
            "pages": (total + limit - 1) // limit if limit > 0 else 0,
            "limit": limit
        }

    async def get_clients_by_bot_ids(
        self,
        bot_ids: List[str],
        skip: int = 0,
        limit: int = 20,
        status: Optional[ClientStatus] = None,
        search: Optional[str] = None
    ) -> Dict:
        """Obtiene clientes de múltiples bots con paginación y filtros"""
        filter_query: Dict = {"bot_id": {"$in": bot_ids}}

        if status:
            filter_query["status"] = status.value

        if search:
            filter_query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"external_id": {"$regex": search, "$options": "i"}},
                {"email": {"$regex": search, "$options": "i"}},
                {"phone": {"$regex": search, "$options": "i"}}
            ]

        total = await self.clients.count_documents(filter_query)
        cursor = self.clients.find(
            filter_query,
            {"_id": 0}
        ).sort([("score", -1), ("last_contact_at", -1)]).skip(skip).limit(limit)

        clients = await cursor.to_list(length=limit)

        return {
            "clients": [Client(**c) for c in clients],
            "total": total,
            "page": (skip // limit) + 1 if limit > 0 else 1,
            "pages": (total + limit - 1) // limit if limit > 0 else 0,
            "limit": limit
        }

    async def update_client(self, client_id: str, update_data: ClientUpdate) -> Optional[Client]:
        """Actualiza un cliente"""
        update_dict = {}

        for key, value in update_data.model_dump(exclude_unset=True).items():
            if value is not None:
                if key == "status":
                    update_dict["status"] = value.value if hasattr(value, 'value') else value
                else:
                    update_dict[key] = value

        if not update_dict:
            return await self.get_client(client_id)

        # Si se actualiza el score manualmente, usarlo tal cual (sin recalcular)
        # Si no viene score en el update, no tocarlo
        update_dict["last_contact_at"] = datetime.utcnow().isoformat()

        result = await self.clients.update_one(
            {"client_id": client_id},
            {"$set": update_dict}
        )

        if result.matched_count > 0:
            return await self.get_client(client_id)
        return None

    async def increment_counters(
        self,
        client_id: str,
        conversations: int = 0,
        messages: int = 0,
        tokens: int = 0
    ):
        """Incrementa contadores del cliente y recalcula el score automáticamente"""
        update_fields = {"last_contact_at": datetime.utcnow().isoformat()}
        inc_fields = {}

        if conversations != 0:
            inc_fields["total_conversations"] = conversations
        if messages != 0:
            inc_fields["total_messages"] = messages
        if tokens != 0:
            inc_fields["total_tokens_used"] = tokens

        update_query = {"$set": update_fields}
        if inc_fields:
            update_query["$inc"] = inc_fields

        await self.clients.update_one(
            {"client_id": client_id},
            update_query
        )

        # Recalcular score tras actualizar contadores
        if messages != 0:
            client = await self.get_client(client_id)
            if client:
                new_score = calculate_score(client.total_messages, client.first_contact_at)
                await self.clients.update_one(
                    {"client_id": client_id},
                    {"$set": {"score": new_score}}
                )

    async def block_client(self, client_id: str) -> bool:
        """Bloquea un cliente"""
        result = await self.clients.update_one(
            {"client_id": client_id},
            {
                "$set": {
                    "status": ClientStatus.BLOCKED.value,
                    "last_contact_at": datetime.utcnow().isoformat()
                }
            }
        )
        return result.modified_count > 0

    async def unblock_client(self, client_id: str) -> bool:
        """Desbloquea un cliente"""
        result = await self.clients.update_one(
            {"client_id": client_id},
            {
                "$set": {
                    "status": ClientStatus.ACTIVE.value,
                    "last_contact_at": datetime.utcnow().isoformat()
                }
            }
        )
        return result.modified_count > 0


# Singleton
_client_service: Optional[ClientService] = None


def get_client_service() -> ClientService:
    """Obtiene la instancia singleton del servicio de clientes"""
    global _client_service
    if _client_service is None:
        _client_service = ClientService()
    return _client_service
