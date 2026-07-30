"""
Conversation Service
Servicio para gestionar conversaciones y mensajes en PostgreSQL
(ver ADR-006 en docs/dev/DECISIONS.md)
"""

from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from pydantic import BaseModel
from sqlalchemy import case, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import AsyncSessionLocal
from app.db.models import Client as ClientModel
from app.db.models import Conversation as ConversationModel
from app.db.models import Message as MessageModel


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


def _parse_iso(value: Optional[str]):
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _to_message_dict(row: MessageModel) -> Dict:
    return {
        "conversation_id": row.conversation_id,
        "role": row.role,
        "content": row.content,
        "timestamp": row.timestamp.isoformat(),
        "metadata": row.metadata_ or {},
    }


class ConversationService:
    """Servicio para gestionar conversaciones en PostgreSQL"""

    async def _messages_for(self, session: AsyncSession, conversation_id: str) -> List[Dict]:
        result = await session.execute(
            select(MessageModel)
            .where(MessageModel.conversation_id == conversation_id)
            .order_by(MessageModel.timestamp.asc())
        )
        return [_to_message_dict(r) for r in result.scalars().all()]

    async def _messages_for_many(
        self, session: AsyncSession, conversation_ids: List[str]
    ) -> Dict[str, List[Dict]]:
        """Trae los mensajes de varias conversaciones en una sola query (evita N+1
        en listados — ver get_all_conversations/get_user_conversations)."""
        if not conversation_ids:
            return {}

        result = await session.execute(
            select(MessageModel)
            .where(MessageModel.conversation_id.in_(conversation_ids))
            .order_by(MessageModel.conversation_id, MessageModel.timestamp.asc())
        )
        messages_by_conversation: Dict[str, List[Dict]] = {cid: [] for cid in conversation_ids}
        for row in result.scalars().all():
            messages_by_conversation[row.conversation_id].append(_to_message_dict(row))
        return messages_by_conversation

    def _row_to_conversation_dict(self, row: ConversationModel, messages: List[Dict]) -> Dict:
        return {
            "conversation_id": row.conversation_id,
            "bot_id": row.bot_id,
            "client_id": row.client_id,
            "user_id": row.user_id,
            "channel": row.channel,
            "messages": messages,
            "created_at": row.created_at.isoformat(),
            "updated_at": row.updated_at.isoformat(),
            "total_tokens_used": row.total_tokens_used,
            "total_cost_usd": float(row.total_cost_usd or 0),
            "metadata": row.metadata_ or {},
        }

    async def _to_conversation_dict(self, session: AsyncSession, row: ConversationModel) -> Dict:
        messages = await self._messages_for(session, row.conversation_id)
        return self._row_to_conversation_dict(row, messages)

    async def _to_conversation_dicts(
        self, session: AsyncSession, rows: List[ConversationModel]
    ) -> List[Dict]:
        """Versión batch de _to_conversation_dict: una sola query de mensajes
        para todas las filas en vez de una por conversación."""
        messages_by_conversation = await self._messages_for_many(
            session, [r.conversation_id for r in rows]
        )
        return [
            self._row_to_conversation_dict(r, messages_by_conversation[r.conversation_id])
            for r in rows
        ]

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
        metadata = metadata or {}

        async with AsyncSessionLocal() as session:
            session.add(ConversationModel(
                conversation_id=conversation_id,
                bot_id=bot_id,
                client_id=client_id,
                user_id=user_id,
                channel=channel,
                source=metadata.get("source"),
                channel_id=metadata.get("channel_id"),
                total_tokens_used=0,
                total_cost_usd=0,
                metadata_=metadata,
            ))
            await session.commit()

        return conversation_id

    async def ensure_conversation(
        self,
        conversation_id: str,
        user_id: str,
        bot_id: Optional[str] = None,
        client_id: Optional[str] = None,
        channel: Optional[str] = None,
        metadata: Optional[Dict] = None,
    ) -> None:
        """
        Garantiza que exista una fila en `conversations` para conversation_id,
        vía INSERT ... ON CONFLICT DO NOTHING -- no falla ni duplica si ya
        existe, así que es seguro llamarla siempre antes de add_message.

        Defensa ante conversation_id "huérfano": bajo condiciones aún no
        explicadas (ver logs de producción, IntegrityError intermitente en
        add_message), la fila creada por create_conversation() al abrir la
        conexión WS a veces no llega a persistir antes de que se logueen
        mensajes contra ese mismo conversation_id, y el INSERT en `messages`
        revienta por la FK -- perdiendo la respuesta real del bot en el
        camino (ver web_chat_router.py). Esto la recrea in extremis con el
        MISMO id en vez de fallar.
        """
        metadata = metadata or {}
        async with AsyncSessionLocal() as session:
            stmt = pg_insert(ConversationModel).values(
                conversation_id=conversation_id,
                bot_id=bot_id,
                client_id=client_id,
                user_id=user_id,
                channel=channel,
                source=metadata.get("source"),
                channel_id=metadata.get("channel_id"),
                total_tokens_used=0,
                total_cost_usd=0,
                metadata_=metadata,
            ).on_conflict_do_nothing(index_elements=["conversation_id"])
            await session.execute(stmt)
            await session.commit()

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
        timestamp = datetime.now(timezone.utc)
        metadata = metadata or {}

        async with AsyncSessionLocal() as session:
            session.add(MessageModel(
                conversation_id=conversation_id,
                role=role,
                content=content,
                timestamp=timestamp,
                metadata_=metadata,
            ))

            conv_row = await session.get(ConversationModel, conversation_id)
            if conv_row:
                conv_row.updated_at = timestamp
                if "tokens_used" in metadata:
                    conv_row.total_tokens_used += metadata["tokens_used"]
                if "estimated_cost_usd" in metadata:
                    conv_row.total_cost_usd = float(conv_row.total_cost_usd or 0) + metadata["estimated_cost_usd"]

            await session.commit()

        return {
            "conversation_id": conversation_id,
            "role": role,
            "content": content,
            "timestamp": timestamp.isoformat(),
            "metadata": metadata,
        }

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
        if not channel and metadata:
            channel = metadata.get("source")

        if not conversation_id:
            conversation_id = await self.create_conversation(
                user_id=user_id,
                metadata={"source": channel or "api_chat"},
                bot_id=bot_id,
                client_id=client_id,
                channel=channel
            )
        else:
            await self.ensure_conversation(
                conversation_id,
                user_id=user_id,
                bot_id=bot_id,
                client_id=client_id,
                channel=channel,
                metadata={"source": channel or "api_chat"},
            )

        await self.add_message(
            conversation_id=conversation_id,
            role="user",
            content=user_message,
            metadata={}
        )

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
        filters = [ConversationModel.user_id == user_id]
        if bot_id:
            filters.append(ConversationModel.bot_id == bot_id)
        if channel_id:
            filters.append(ConversationModel.channel_id == channel_id)

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(ConversationModel).where(*filters).order_by(ConversationModel.updated_at.desc())
            )
            row = result.scalars().first()
            if not row:
                return None
            return await self._to_conversation_dict(session, row)

    async def get_conversation(self, conversation_id: str) -> Optional[Dict]:
        """
        Obtiene una conversación por ID

        Args:
            conversation_id: ID de la conversación

        Returns:
            Conversación o None si no existe
        """
        async with AsyncSessionLocal() as session:
            row = await session.get(ConversationModel, conversation_id)
            if not row:
                return None
            return await self._to_conversation_dict(session, row)

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
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(ConversationModel)
                .where(ConversationModel.user_id == user_id)
                .order_by(ConversationModel.updated_at.desc())
                .limit(limit)
            )
            rows = result.scalars().all()
            return await self._to_conversation_dicts(session, rows)

    async def get_conversation_stats(
        self, bot_ids: Optional[List[str]] = None, owner_usernames: Optional[List[str]] = None
    ) -> Dict:
        """
        Obtiene estadísticas generales de conversaciones

        Args:
            bot_ids: Lista de bot_ids para filtrar (si None, retorna todo)
            owner_usernames: ver get_all_conversations (None = sin restricción)

        Returns:
            Estadísticas de uso
        """
        base_filters = []
        if bot_ids is not None:
            # Incluir conversaciones legacy sin bot_id (bot_id=None) además de las del owner
            base_filters.append(or_(ConversationModel.bot_id.in_(bot_ids), ConversationModel.bot_id.is_(None)))
        if owner_usernames is not None:
            owned_client_ids = select(ClientModel.client_id).where(
                ClientModel.owner_username.in_(owner_usernames)
            )
            base_filters.append(ConversationModel.client_id.in_(owned_client_ids))

        async with AsyncSessionLocal() as session:
            # Todo lo que sale de la tabla conversations en una sola query
            # (antes eran 5 idas y vueltas secuenciales — cada round-trip paga
            # latencia fija sin importar el volumen de filas, así que con pocos
            # registros el cuello de botella era la CANTIDAD de queries, no su costo).
            conv_stats = (await session.execute(
                select(
                    func.count().label("total_conversations"),
                    func.sum(ConversationModel.total_tokens_used).label("total_tokens"),
                    func.sum(ConversationModel.total_cost_usd).label("total_cost"),
                    func.count(func.distinct(ConversationModel.user_id)).label("active_users"),
                    func.sum(case((ConversationModel.source == "whatsapp", 1), else_=0)).label("whatsapp_count"),
                    func.sum(case((ConversationModel.source == "telegram", 1), else_=0)).label("telegram_count"),
                ).select_from(ConversationModel).where(*base_filters)
            )).one()

            # total_messages requiere JOIN a una tabla distinta (grano de mensaje,
            # no de conversación) — no se puede combinar en el aggregate de arriba
            # sin multiplicar las filas de conversations por sus mensajes.
            total_messages = (await session.execute(
                select(func.count(MessageModel.message_id))
                .select_from(MessageModel)
                .join(ConversationModel, ConversationModel.conversation_id == MessageModel.conversation_id)
                .where(*base_filters)
            )).scalar_one()

        total_conversations = conv_stats.total_conversations
        whatsapp_count = conv_stats.whatsapp_count or 0
        telegram_count = conv_stats.telegram_count or 0

        return {
            "total_conversations": total_conversations,
            "total_messages": total_messages,
            "total_tokens_used": conv_stats.total_tokens or 0,
            "total_cost_usd": round(float(conv_stats.total_cost or 0), 6),
            "active_users": conv_stats.active_users,
            "conversations_by_platform": {
                "whatsapp": whatsapp_count,
                "telegram": telegram_count,
                "other": total_conversations - whatsapp_count - telegram_count
            }
        }

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
        bot_ids: Optional[List[str]] = None,
        owner_usernames: Optional[List[str]] = None,
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
            owner_usernames: si se pasa, sólo conversaciones de clientes de
                esos abogados (ver UserService.get_scoped_owner_usernames).
                None = sin restricción.

        Returns:
            Dict con conversaciones, total y metadata de paginación
        """
        filters = []

        if bot_ids is not None:
            filters.append(or_(ConversationModel.bot_id.in_(bot_ids), ConversationModel.bot_id.is_(None)))
        elif bot_id:
            filters.append(ConversationModel.bot_id == bot_id)

        if owner_usernames is not None:
            owned_client_ids = select(ClientModel.client_id).where(
                ClientModel.owner_username.in_(owner_usernames)
            )
            filters.append(ConversationModel.client_id.in_(owned_client_ids))

        if client_id:
            filters.append(ConversationModel.client_id == client_id)

        if user_id:
            filters.append(ConversationModel.user_id == user_id)

        if platform:
            filters.append(ConversationModel.source == platform)

        if date_from:
            filters.append(ConversationModel.created_at >= _parse_iso(date_from))
        if date_to:
            filters.append(ConversationModel.created_at <= _parse_iso(date_to))

        if search:
            pattern = f"%{search}%"
            message_exists = (
                select(MessageModel.message_id)
                .where(MessageModel.conversation_id == ConversationModel.conversation_id)
                .where(MessageModel.content.ilike(pattern))
                .exists()
            )
            filters.append(or_(ConversationModel.user_id.ilike(pattern), message_exists))

        sort_column = getattr(ConversationModel, sort_by, ConversationModel.updated_at)
        order_clause = sort_column.desc() if order == "desc" else sort_column.asc()

        async with AsyncSessionLocal() as session:
            total = (await session.execute(
                select(func.count()).select_from(ConversationModel).where(*filters)
            )).scalar_one()

            result = await session.execute(
                select(ConversationModel).where(*filters).order_by(order_clause).offset(skip).limit(limit)
            )
            rows = result.scalars().all()
            conversations = await self._to_conversation_dicts(session, rows)

        total_pages = (total + limit - 1) // limit if limit > 0 else 0
        current_page = (skip // limit) + 1 if limit > 0 else 1

        return {
            "conversations": conversations,
            "total": total,
            "page": current_page,
            "pages": total_pages,
            "limit": limit
        }

    async def get_timeline_stats(
        self, days: int = 30, bot_ids: Optional[List[str]] = None,
        owner_usernames: Optional[List[str]] = None,
    ) -> Dict:
        """
        Obtiene estadísticas por día para los últimos N días

        Args:
            days: Número de días hacia atrás
            bot_ids: Lista de bot_ids para filtrar (si None, retorna todo)
            owner_usernames: ver get_all_conversations (None = sin restricción)

        Returns:
            Dict con timeline de estadísticas
        """
        date_from = datetime.now(timezone.utc) - timedelta(days=days)

        filters = [ConversationModel.created_at >= date_from]
        if bot_ids is not None:
            filters.append(or_(ConversationModel.bot_id.in_(bot_ids), ConversationModel.bot_id.is_(None)))
        if owner_usernames is not None:
            owned_client_ids = select(ClientModel.client_id).where(
                ClientModel.owner_username.in_(owner_usernames)
            )
            filters.append(ConversationModel.client_id.in_(owned_client_ids))

        msg_count_subq = (
            select(
                MessageModel.conversation_id.label("conversation_id"),
                func.count().label("msg_count"),
            )
            .group_by(MessageModel.conversation_id)
            .subquery()
        )

        day_col = func.date_trunc("day", ConversationModel.created_at).label("day")

        async with AsyncSessionLocal() as session:
            stmt = (
                select(
                    day_col,
                    func.count(ConversationModel.conversation_id).label("conversations"),
                    func.coalesce(func.sum(msg_count_subq.c.msg_count), 0).label("messages"),
                    func.sum(ConversationModel.total_tokens_used).label("tokens"),
                    func.sum(ConversationModel.total_cost_usd).label("cost"),
                )
                .select_from(ConversationModel)
                .outerjoin(msg_count_subq, msg_count_subq.c.conversation_id == ConversationModel.conversation_id)
                .where(*filters)
                .group_by(day_col)
                .order_by(day_col)
            )
            rows = (await session.execute(stmt)).all()

        timeline = []
        for row in rows:
            timeline.append({
                "date": row.day.date().isoformat(),
                "conversations": row.conversations,
                "messages": int(row.messages),
                "tokens": row.tokens or 0,
                "cost": round(float(row.cost or 0), 6),
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
        date_from = datetime.now(timezone.utc) - timedelta(days=days)

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(func.count(func.distinct(ConversationModel.user_id)))
                .where(ConversationModel.created_at >= date_from)
            )
            return result.scalar_one()


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
