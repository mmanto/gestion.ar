"""
Modelos SQLAlchemy declarativos — esquema PostgreSQL (ADR-006).

Estos modelos conviven con los schemas Pydantic de app/models/, que siguen
siendo la fuente de verdad para las APIs (validación/serialización).
"""

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB

from app.db.database import Base


class User(Base):
    __tablename__ = "users"

    username = Column(Text, primary_key=True)
    email = Column(Text, nullable=True)
    hashed_password = Column(Text, nullable=False)
    disabled = Column(Boolean, nullable=False, default=False)
    auth_provider = Column(Text, nullable=True)
    provider_user_id = Column(Text, nullable=True)
    google_id = Column(Text, nullable=True)
    nango_connection_id = Column(Text, nullable=True)
    gmail_sender_email = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_users_email", "email"),
        Index("ix_users_google_id", "google_id", unique=True, postgresql_where=text("google_id IS NOT NULL")),
        Index(
            "ix_users_auth_provider_user_id",
            "auth_provider",
            "provider_user_id",
        ),
    )


class Bot(Base):
    __tablename__ = "bots"

    bot_id = Column(Text, primary_key=True)
    owner_id = Column(Text, ForeignKey("users.username"), nullable=False)
    name = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    business_type = Column(Text, nullable=False)
    status = Column(Text, nullable=False, default="active")
    config = Column(JSONB, nullable=False, default=dict)
    metadata_ = Column("metadata", JSONB, nullable=True)
    # Lista simple de channel_ids (sin FK a channels: ese servicio aún no está
    # migrado y la tabla channels está vacía en Postgres — ver plan de Fase 2).
    channel_ids = Column(JSONB, nullable=False, default=list, server_default="[]")
    total_clients = Column(Integer, nullable=False, default=0)
    total_conversations = Column(Integer, nullable=False, default=0)
    total_messages = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_bots_owner_id", "owner_id"),
        Index("ix_bots_status", "status"),
        Index("ix_bots_created_at", "created_at"),
    )


class Channel(Base):
    __tablename__ = "channels"

    channel_id = Column(Text, primary_key=True)
    bot_id = Column(Text, ForeignKey("bots.bot_id", ondelete="CASCADE"), nullable=False)
    channel_type = Column(Text, nullable=False)
    name = Column(Text, nullable=False)
    status = Column(Text, nullable=False, default="pending")
    whatsapp_config = Column(JSONB, nullable=True)
    telegram_config = Column(JSONB, nullable=True)
    web_config = Column(JSONB, nullable=True)
    pwa_config = Column(JSONB, nullable=True)
    webhook_url = Column(Text, nullable=True)
    total_messages_received = Column(Integer, nullable=False, default=0)
    total_messages_sent = Column(Integer, nullable=False, default=0)
    metadata_ = Column("metadata", JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    last_activity_at = Column(DateTime(timezone=True), nullable=True)

    # Nota: no hay CHECK constraint que exija *_config según channel_type — la
    # lógica de negocio real (channel_router.py) no lo exige de forma
    # consistente (canales web/pwa no requieren config), y los datos reales lo
    # confirman.
    __table_args__ = (
        Index("ix_channels_bot_id", "bot_id"),
        Index("ix_channels_bot_id_channel_type", "bot_id", "channel_type"),
        Index("ix_channels_status", "status"),
        Index(
            "ix_channels_twilio_phone_number",
            text("(whatsapp_config -> 'twilio_config' ->> 'phone_number')"),
        ),
    )


class Client(Base):
    __tablename__ = "clients"

    client_id = Column(Text, primary_key=True)
    bot_id = Column(Text, ForeignKey("bots.bot_id", ondelete="CASCADE"), nullable=False)
    external_id = Column(Text, nullable=False)
    source = Column(Text, nullable=False)
    name = Column(Text, nullable=True)
    email = Column(Text, nullable=True)
    phone = Column(Text, nullable=True)
    status = Column(Text, nullable=False, default="active")
    score = Column(Numeric, nullable=False, default=0)
    total_conversations = Column(Integer, nullable=False, default=0)
    total_messages = Column(Integer, nullable=False, default=0)
    total_tokens_used = Column(Integer, nullable=False, default=0)
    first_contact_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_contact_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    metadata_ = Column("metadata", JSONB, nullable=True)

    __table_args__ = (
        Index("ix_clients_bot_id_external_id", "bot_id", "external_id", unique=True),
        Index("ix_clients_bot_id_status", "bot_id", "status"),
        Index("ix_clients_last_contact_at", "last_contact_at"),
        Index("ix_clients_score", "score"),
    )


class Conversation(Base):
    __tablename__ = "conversations"

    conversation_id = Column(Text, primary_key=True)
    bot_id = Column(Text, ForeignKey("bots.bot_id"), nullable=True)
    client_id = Column(Text, ForeignKey("clients.client_id"), nullable=True)
    user_id = Column(Text, nullable=False)
    channel = Column(Text, nullable=True)
    # Promovidos desde metadata.source / metadata.channel_id — se consultan con
    # filtros WHERE reales en conversation_service.py (get_conversation_stats,
    # get_all_conversations, get_latest_conversation_by_user).
    source = Column(Text, nullable=True)
    channel_id = Column(Text, ForeignKey("channels.channel_id"), nullable=True)
    total_tokens_used = Column(Integer, nullable=False, default=0)
    total_cost_usd = Column(Numeric, nullable=False, default=0)
    metadata_ = Column("metadata", JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_conversations_bot_id", "bot_id"),
        Index("ix_conversations_client_id", "client_id"),
        Index("ix_conversations_user_id", "user_id"),
        Index("ix_conversations_source", "source"),
        Index("ix_conversations_created_at", "created_at"),
    )


class Message(Base):
    """Tabla hija normalizada — reemplaza el array embebido conversations.messages."""

    __tablename__ = "messages"

    message_id = Column(BigInteger, primary_key=True, autoincrement=True)
    conversation_id = Column(
        Text, ForeignKey("conversations.conversation_id", ondelete="CASCADE"), nullable=False
    )
    role = Column(Text, nullable=False)
    content = Column(Text, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    metadata_ = Column("metadata", JSONB, nullable=True)

    __table_args__ = (
        CheckConstraint("role IN ('user', 'assistant')", name="ck_messages_role"),
        Index("ix_messages_conversation_id_timestamp", "conversation_id", "timestamp"),
    )


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    subscription_id = Column(Text, primary_key=True)
    bot_id = Column(Text, ForeignKey("bots.bot_id", ondelete="CASCADE"), nullable=False)
    channel_id = Column(Text, ForeignKey("channels.channel_id"), nullable=True)
    client_id = Column(Text, ForeignKey("clients.client_id"), nullable=True)
    endpoint = Column(Text, nullable=False, unique=True)
    p256dh = Column(Text, nullable=False)
    auth = Column(Text, nullable=False)
    user_agent = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    expiration_time = Column(BigInteger, nullable=True)

    __table_args__ = (
        Index("ix_push_subscriptions_bot_id", "bot_id"),
        Index("ix_push_subscriptions_bot_id_channel_id", "bot_id", "channel_id"),
        Index("ix_push_subscriptions_bot_id_is_active", "bot_id", "is_active"),
        Index(
            "ix_push_subscriptions_client_id",
            "client_id",
            postgresql_where=text("client_id IS NOT NULL"),
        ),
    )
