"""
Conversation Service
Servicio para gestionar conversaciones y mensajes en MongoDB
"""

import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel


class ConversationMessage(BaseModel):
    """Modelo para un mensaje en una conversación"""
    role: str  # "user" o "assistant"
    content: str
    timestamp: str
    metadata: Optional[Dict] = None


class Conversation(BaseModel):
    """Modelo para una conversación completa"""
    conversation_id: str
    bot_id: Optional[str] = None  # ID del bot asociado
    client_id: Optional[str] = None  # ID del cliente asociado
    user_id: str  # WhatsApp phone number o identificador único (retrocompatibilidad)
    channel: Optional[str] = None  # Canal: whatsapp, telegram, web
    messages: List[ConversationMessage]
    created_at: str
    updated_at: str
    total_tokens_used: int = 0
    total_cost_usd: float = 0.0
    metadata: Optional[Dict] = None


class ConversationService:
    """Servicio para gestionar conversaciones en MongoDB"""

    def __init__(self):
        """Inicializa el servicio de conversaciones"""
        self.mongodb_uri = os.getenv("MONGODB_URI", "mongodb://mongo:27017/whatsapp")
        self.client = AsyncIOMotorClient(self.mongodb_uri)
        self.db = self.client.get_default_database()
        self.conversations = self.db.conversations
        self.messages = self.db.messages

        print("✅ Conversation Service inicializado")
        print(f"📊 MongoDB URI: {self.mongodb_uri}")

    async def create_conversation(
        self,
        user_id: str,
        metadata: Optional[Dict] = None,
        bot_id: Optional[str] = None,
        client_id: Optional[str] = None,
        channel: Optional[str] = None
    ) -> str:
        """
        Crea una nueva conversación

        Args:
            user_id: ID del usuario (WhatsApp phone number)
            metadata: Metadatos adicionales
            bot_id: ID del bot asociado
            client_id: ID del cliente asociado
            channel: Canal de la conversación (whatsapp, telegram, web)

        Returns:
            conversation_id: ID de la conversación creada
        """
        timestamp = datetime.utcnow().isoformat()
        conversation_id = f"{user_id}_{timestamp}"

        conversation = {
            "conversation_id": conversation_id,
            "bot_id": bot_id,
            "client_id": client_id,
            "user_id": user_id,
            "channel": channel,
            "messages": [],
            "created_at": timestamp,
            "updated_at": timestamp,
            "total_tokens_used": 0,
            "total_cost_usd": 0.0,
            "metadata": metadata or {}
        }

        await self.conversations.insert_one(conversation)
        return conversation_id

    async def add_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        metadata: Optional[Dict] = None
    ) -> Dict:
        """
        Agrega un mensaje a una conversación

        Args:
            conversation_id: ID de la conversación
            role: "user" o "assistant"
            content: Contenido del mensaje
            metadata: Metadatos del mensaje (tokens, costo, etc.)

        Returns:
            Mensaje creado
        """
        timestamp = datetime.utcnow().isoformat()

        message = {
            "conversation_id": conversation_id,
            "role": role,
            "content": content,
            "timestamp": timestamp,
            "metadata": metadata or {}
        }

        # Guardar mensaje en colección de mensajes
        await self.messages.insert_one(message.copy())

        # Actualizar conversación
        update_data = {
            "$push": {"messages": message},
            "$set": {"updated_at": timestamp}
        }

        # Si hay metadatos de tokens/costo, actualizar totales
        if metadata:
            if "tokens_used" in metadata:
                update_data["$inc"] = {"total_tokens_used": metadata["tokens_used"]}
            if "estimated_cost_usd" in metadata:
                update_data["$inc"] = update_data.get("$inc", {})
                update_data["$inc"]["total_cost_usd"] = metadata["estimated_cost_usd"]

        await self.conversations.update_one(
            {"conversation_id": conversation_id},
            update_data
        )

        return message

    async def log_chat_interaction(
        self,
        user_id: str,
        user_message: str,
        assistant_response: str,
        metadata: Optional[Dict] = None,
        conversation_id: Optional[str] = None,
        bot_id: Optional[str] = None,
        client_id: Optional[str] = None,
        channel: Optional[str] = None
    ) -> Dict:
        """
        Registra una interacción completa de chat (pregunta + respuesta)

        Args:
            user_id: ID del usuario
            user_message: Mensaje del usuario
            assistant_response: Respuesta del asistente
            metadata: Metadatos (tokens, costo, modelo, etc.)
            conversation_id: ID de conversación existente (opcional)
            bot_id: ID del bot asociado
            client_id: ID del cliente asociado
            channel: Canal de la conversación

        Returns:
            Dict con información de la conversación
        """
        # Extraer channel de metadata si no se proporciona directamente
        if not channel and metadata:
            channel = metadata.get("source")

        # Crear nueva conversación si no existe
        if not conversation_id:
            conversation_id = await self.create_conversation(
                user_id=user_id,
                metadata={"source": channel or "api_chat"},
                bot_id=bot_id,
                client_id=client_id,
                channel=channel
            )

        # Guardar mensaje del usuario
        await self.add_message(
            conversation_id=conversation_id,
            role="user",
            content=user_message,
            metadata={}
        )

        # Guardar respuesta del asistente
        await self.add_message(
            conversation_id=conversation_id,
            role="assistant",
            content=assistant_response,
            metadata=metadata or {}
        )

        return {
            "conversation_id": conversation_id,
            "user_id": user_id,
            "bot_id": bot_id,
            "client_id": client_id,
            "timestamp": datetime.utcnow().isoformat()
        }

    async def get_latest_conversation_by_user(
        self,
        user_id: str,
        bot_id: Optional[str] = None,
        channel_id: Optional[str] = None,
    ) -> Optional[Dict]:
        """
        Retorna la conversación más reciente de un usuario para un bot/canal dado.
        Útil para reanudar la sesión cuando el cliente reconecta.
        """
        query: Dict = {"user_id": user_id}
        if bot_id:
            query["bot_id"] = bot_id
        if channel_id:
            query["metadata.channel_id"] = channel_id

        doc = await self.conversations.find_one(
            query,
            {"_id": 0},
            sort=[("updated_at", -1)],
        )
        return doc

    async def get_conversation(self, conversation_id: str) -> Optional[Dict]:
        """
        Obtiene una conversación por ID

        Args:
            conversation_id: ID de la conversación

        Returns:
            Conversación o None si no existe
        """
        conversation = await self.conversations.find_one(
            {"conversation_id": conversation_id},
            {"_id": 0}
        )
        return conversation

    async def get_user_conversations(
        self,
        user_id: str,
        limit: int = 10
    ) -> List[Dict]:
        """
        Obtiene las conversaciones de un usuario

        Args:
            user_id: ID del usuario
            limit: Número máximo de conversaciones a retornar

        Returns:
            Lista de conversaciones
        """
        cursor = self.conversations.find(
            {"user_id": user_id},
            {"_id": 0}
        ).sort("updated_at", -1).limit(limit)

        conversations = await cursor.to_list(length=limit)
        return conversations

    async def get_conversation_stats(self, bot_ids: Optional[List[str]] = None) -> Dict:
        """
        Obtiene estadísticas generales de conversaciones

        Args:
            bot_ids: Lista de bot_ids para filtrar (si None, retorna todo)

        Returns:
            Estadísticas de uso
        """
        base_filter: Dict = {}
        if bot_ids is not None:
            base_filter["bot_id"] = {"$in": bot_ids + [None]}

        total_conversations = await self.conversations.count_documents(base_filter)
        total_messages = await self.messages.count_documents({})

        # Calcular totales de tokens y costos
        pipeline = [
            {"$match": base_filter} if base_filter else {"$match": {}},
            {
                "$group": {
                    "_id": None,
                    "total_tokens": {"$sum": "$total_tokens_used"},
                    "total_cost": {"$sum": "$total_cost_usd"}
                }
            }
        ]

        result = await self.conversations.aggregate(pipeline).to_list(1)

        # Contar usuarios activos (únicos)
        active_users = await self.conversations.distinct("user_id", base_filter)

        # Contar por plataforma
        whatsapp_filter = {**base_filter, "metadata.source": "whatsapp"}
        telegram_filter = {**base_filter, "metadata.source": "telegram"}
        whatsapp_count = await self.conversations.count_documents(whatsapp_filter)
        telegram_count = await self.conversations.count_documents(telegram_filter)

        stats = {
            "total_conversations": total_conversations,
            "total_messages": total_messages,
            "total_tokens_used": result[0]["total_tokens"] if result else 0,
            "total_cost_usd": round(result[0]["total_cost"], 6) if result else 0.0,
            "active_users": len(active_users),
            "conversations_by_platform": {
                "whatsapp": whatsapp_count,
                "telegram": telegram_count,
                "other": total_conversations - whatsapp_count - telegram_count
            }
        }

        return stats

    async def get_all_conversations(
        self,
        skip: int = 0,
        limit: int = 20,
        user_id: Optional[str] = None,
        platform: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        search: Optional[str] = None,
        sort_by: str = "updated_at",
        order: str = "desc",
        bot_id: Optional[str] = None,
        client_id: Optional[str] = None,
        bot_ids: Optional[List[str]] = None
    ) -> Dict:
        """
        Obtiene conversaciones con paginación y filtros

        Args:
            skip: Número de documentos a saltar (para paginación)
            limit: Número máximo de conversaciones a retornar
            user_id: Filtrar por user_id específico
            platform: Filtrar por plataforma (whatsapp, telegram)
            date_from: Fecha inicial (ISO format)
            date_to: Fecha final (ISO format)
            search: Buscar en user_id o contenido de mensajes
            sort_by: Campo por el cual ordenar (updated_at, created_at, total_tokens_used)
            order: Orden (asc, desc)

        Returns:
            Dict con conversaciones, total y metadata de paginación
        """
        # Construir filtro
        filter_query = {}

        if bot_ids is not None:
            # Incluir conversaciones legacy sin bot_id (bot_id=None) además de las del owner
            filter_query["bot_id"] = {"$in": bot_ids + [None]}
        elif bot_id:
            filter_query["bot_id"] = bot_id

        if client_id:
            filter_query["client_id"] = client_id

        if user_id:
            filter_query["user_id"] = user_id

        if platform:
            filter_query["metadata.source"] = platform

        if date_from or date_to:
            date_filter = {}
            if date_from:
                date_filter["$gte"] = date_from
            if date_to:
                date_filter["$lte"] = date_to
            filter_query["created_at"] = date_filter

        if search:
            # Buscar en user_id o en el contenido de mensajes
            filter_query["$or"] = [
                {"user_id": {"$regex": search, "$options": "i"}},
                {"messages.content": {"$regex": search, "$options": "i"}}
            ]

        # Contar total de documentos que coinciden con el filtro
        total = await self.conversations.count_documents(filter_query)

        # Determinar orden
        sort_order = -1 if order == "desc" else 1

        # Obtener conversaciones
        cursor = self.conversations.find(
            filter_query,
            {"_id": 0}
        ).sort(sort_by, sort_order).skip(skip).limit(limit)

        conversations = await cursor.to_list(length=limit)

        # Calcular metadata de paginación
        total_pages = (total + limit - 1) // limit if limit > 0 else 0
        current_page = (skip // limit) + 1 if limit > 0 else 1

        return {
            "conversations": conversations,
            "total": total,
            "page": current_page,
            "pages": total_pages,
            "limit": limit
        }

    async def get_timeline_stats(self, days: int = 30, bot_ids: Optional[List[str]] = None) -> Dict:
        """
        Obtiene estadísticas por día para los últimos N días

        Args:
            days: Número de días hacia atrás
            bot_ids: Lista de bot_ids para filtrar (si None, retorna todo)

        Returns:
            Dict con timeline de estadísticas
        """
        # Calcular fecha de inicio
        date_from = (datetime.utcnow() - timedelta(days=days)).isoformat()

        # Construir filtro de match
        match_filter: Dict = {"created_at": {"$gte": date_from}}
        if bot_ids is not None:
            match_filter["bot_id"] = {"$in": bot_ids + [None]}

        # Agregación para obtener estadísticas por día
        pipeline = [
            {
                "$match": match_filter
            },
            {
                "$addFields": {
                    "date": {"$substr": ["$created_at", 0, 10]}  # Extraer solo la fecha YYYY-MM-DD
                }
            },
            {
                "$group": {
                    "_id": "$date",
                    "conversations": {"$sum": 1},
                    "messages": {"$sum": {"$size": "$messages"}},
                    "tokens": {"$sum": "$total_tokens_used"},
                    "cost": {"$sum": "$total_cost_usd"}
                }
            },
            {
                "$sort": {"_id": 1}
            }
        ]

        results = await self.conversations.aggregate(pipeline).to_list(length=days)

        # Formatear resultados
        timeline = []
        for result in results:
            timeline.append({
                "date": result["_id"],
                "conversations": result["conversations"],
                "messages": result["messages"],
                "tokens": result["tokens"],
                "cost": round(result["cost"], 6)
            })

        return {
            "days": days,
            "timeline": timeline
        }

    async def get_active_users_count(self, days: int = 7) -> int:
        """
        Obtiene el número de usuarios activos en los últimos N días

        Args:
            days: Número de días hacia atrás

        Returns:
            Número de usuarios únicos activos
        """
        date_from = (datetime.utcnow() - timedelta(days=days)).isoformat()

        # Obtener usuarios únicos que tienen conversaciones desde date_from
        active_users = await self.conversations.distinct(
            "user_id",
            {"created_at": {"$gte": date_from}}
        )

        return len(active_users)


# Instancia global del servicio
_conversation_service: Optional[ConversationService] = None


def get_conversation_service() -> ConversationService:
    """
    Obtiene la instancia del servicio de conversaciones (singleton)

    Returns:
        Instancia de ConversationService
    """
    global _conversation_service
    if _conversation_service is None:
        _conversation_service = ConversationService()
    return _conversation_service
