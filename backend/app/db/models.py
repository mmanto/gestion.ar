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


class Plan(Base):
    """Plan de suscripción ofrecido a los tenants (ver estrategia de
    facturación, docs/dev/DECISIONS.md)."""

    __tablename__ = "plans"

    plan_id = Column(Text, primary_key=True)
    name = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    amount = Column(Numeric, nullable=False)
    periodicity = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("periodicity IN ('monthly', 'annual')", name="ck_plans_periodicity"),
    )


class Tenant(Base):
    __tablename__ = "tenants"

    tenant_id = Column(Text, primary_key=True)
    name = Column(Text, nullable=False)
    # Dominio propio del tenant (ej. "ius.com.mx") — no un subdominio de
    # gestion.ar, cada proyecto gestionado tiene su propio dominio (ver
    # docs/dev/DECISIONS.md, estrategia multi-tenant).
    domain = Column(Text, nullable=True)
    status = Column(Text, nullable=False, default="active", server_default="active")
    branding = Column(JSONB, nullable=False, default=dict, server_default="{}")
    # Todo tenant está suscripto a un plan específico (ver estrategia de
    # facturación) — FK a plans, no nullable (se backfillea en la migración
    # que introduce esta columna).
    plan_id = Column(Text, ForeignKey("plans.plan_id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_tenants_domain", "domain", unique=True, postgresql_where=text("domain IS NOT NULL")),
        Index("ix_tenants_status", "status"),
        Index("ix_tenants_plan_id", "plan_id"),
        CheckConstraint("status IN ('active', 'suspended', 'trial')", name="ck_tenants_status"),
    )


class Module(Base):
    """Catálogo de módulos otorgables a un bot (ver bot_modules). Semilla vía
    migración — la modularización real del código sigue siendo trabajo
    futuro; hoy esto es sólo la capa de entitlement."""

    __tablename__ = "modules"

    module_key = Column(Text, primary_key=True)
    name = Column(Text, nullable=False)
    description = Column(Text, nullable=True)


class BotModule(Base):
    """Otorgamiento (super_admin) y habilitación (admin del tenant) de un
    módulo para un bot puntual. `enabled` sólo puede ser true si `granted` es
    true — reforzado también a nivel API."""

    __tablename__ = "bot_modules"

    bot_id = Column(Text, ForeignKey("bots.bot_id", ondelete="CASCADE"), primary_key=True)
    module_key = Column(Text, ForeignKey("modules.module_key"), primary_key=True)
    granted = Column(Boolean, nullable=False, default=False, server_default="false")
    enabled = Column(Boolean, nullable=False, default=False, server_default="false")
    granted_by = Column(Text, ForeignKey("users.username"), nullable=True)
    granted_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("NOT enabled OR granted", name="ck_bot_modules_enabled_requires_granted"),
        Index("ix_bot_modules_module_key", "module_key"),
    )


class User(Base):
    __tablename__ = "users"

    username = Column(Text, primary_key=True)
    email = Column(Text, nullable=True)
    nombre = Column(Text, nullable=True)
    apellido = Column(Text, nullable=True)
    avatar_url = Column(Text, nullable=True)
    hashed_password = Column(Text, nullable=False)
    disabled = Column(Boolean, nullable=False, default=False)
    auth_provider = Column(Text, nullable=True)
    provider_user_id = Column(Text, nullable=True)
    google_id = Column(Text, nullable=True)
    nango_connection_id = Column(Text, nullable=True)
    gmail_sender_email = Column(Text, nullable=True)
    # tenant_id nullable: super_admin no pertenece a ningún tenant.
    tenant_id = Column(Text, ForeignKey("tenants.tenant_id"), nullable=True)
    role = Column(Text, nullable=False, default="admin", server_default="admin")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_users_email", "email"),
        Index("ix_users_google_id", "google_id", unique=True, postgresql_where=text("google_id IS NOT NULL")),
        Index(
            "ix_users_auth_provider_user_id",
            "auth_provider",
            "provider_user_id",
        ),
        Index("ix_users_tenant_id", "tenant_id"),
        CheckConstraint("role IN ('super_admin', 'admin', 'operativo')", name="ck_users_role"),
        CheckConstraint(
            "(role = 'super_admin' AND tenant_id IS NULL) OR "
            "(role IN ('admin', 'operativo') AND tenant_id IS NOT NULL)",
            name="ck_users_role_tenant_consistency",
        ),
    )


class Bot(Base):
    __tablename__ = "bots"

    bot_id = Column(Text, primary_key=True)
    # Quién de administración general configuró técnicamente este bot
    # (auditoría interna) — la autorización real es por tenant_id.
    owner_id = Column(Text, ForeignKey("users.username"), nullable=False)
    tenant_id = Column(Text, ForeignKey("tenants.tenant_id"), nullable=False)
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
        Index("ix_bots_tenant_id", "tenant_id"),
        Index("ix_bots_status", "status"),
        Index("ix_bots_created_at", "created_at"),
    )


class Channel(Base):
    __tablename__ = "channels"

    channel_id = Column(Text, primary_key=True)
    bot_id = Column(Text, ForeignKey("bots.bot_id", ondelete="CASCADE"), nullable=False)
    tenant_id = Column(Text, ForeignKey("tenants.tenant_id"), nullable=False)
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
        Index("ix_channels_tenant_id", "tenant_id"),
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
    tenant_id = Column(Text, ForeignKey("tenants.tenant_id"), nullable=False)
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
        Index("ix_clients_tenant_id", "tenant_id"),
        Index("ix_clients_bot_id_status", "bot_id", "status"),
        Index("ix_clients_last_contact_at", "last_contact_at"),
        Index("ix_clients_score", "score"),
    )


class Prospect(Base):
    """Entidad propia de prospección (grilla de Escritorio) — conceptualmente
    distinta de Client (contacto/lead que ya interactuó con un bot): por ahora
    comparte forma con Client pero no tiene bot_id ni métricas de conversación,
    y se espera que evolucione con campos propios de embudo de ventas."""

    __tablename__ = "prospects"

    prospect_id = Column(Text, primary_key=True)
    tenant_id = Column(Text, ForeignKey("tenants.tenant_id"), nullable=False)
    estado = Column(Text, nullable=False, default="nuevo")
    nombre = Column(Text, nullable=False)
    fecha_interaccion = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    canal = Column(Text, nullable=True)
    whatsapp = Column(Text, nullable=True)
    email = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_prospects_tenant_id", "tenant_id"),
        Index("ix_prospects_fecha_interaccion", "fecha_interaccion"),
    )


class Conversation(Base):
    __tablename__ = "conversations"

    conversation_id = Column(Text, primary_key=True)
    bot_id = Column(Text, ForeignKey("bots.bot_id"), nullable=True)
    tenant_id = Column(Text, ForeignKey("tenants.tenant_id"), nullable=True)
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
        Index("ix_conversations_tenant_id", "tenant_id"),
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
    tenant_id = Column(Text, ForeignKey("tenants.tenant_id"), nullable=False)
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
        Index("ix_push_subscriptions_tenant_id", "tenant_id"),
        Index("ix_push_subscriptions_bot_id_channel_id", "bot_id", "channel_id"),
        Index("ix_push_subscriptions_bot_id_is_active", "bot_id", "is_active"),
        Index(
            "ix_push_subscriptions_client_id",
            "client_id",
            postgresql_where=text("client_id IS NOT NULL"),
        ),
    )
