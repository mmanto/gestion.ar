#!/usr/bin/env python3
"""
Alta de tenant "openpadel" con dominio propio openpadel.pro.

Crea (idempotente por domain):
  - Tenant  -> name=openpadel, domain=openpadel.pro
  - User    -> openpadel_admin (role=admin)
  - Bot     -> "openpadel" (business_type=turnos, owner=usuario admin)
  - Channel -> canal web activo para el bot (chat de la landing)

Uso (dentro del contenedor del backend):

    docker compose exec app python scripts/create_openpadel_tenant.py

Tras ejecutar, copiar el TENANT_ID impreso en .env.prod como
TENANT_ID_OPENPADEL y redeployar el servicio frontend-tenant-openpadel.
"""

import asyncio
import uuid

from sqlalchemy import select

from app.auth_service import get_password_hash
from app.db.database import AsyncSessionLocal
from app.db.models import Bot, Channel, Tenant, User

DOMAIN = "openpadel.pro"
DEFAULT_PLAN_ID = "plan_000000000000"  # Plan Básico por defecto
ADMIN_USERNAME = "openpadel_admin"
ADMIN_PASSWORD = "openpadel123456"  # Cambiar tras el primer login


async def main() -> None:
    async with AsyncSessionLocal() as session:
        # 1) Tenant
        result = await session.execute(select(Tenant).where(Tenant.domain == DOMAIN))
        tenant = result.scalars().first()
        if tenant is None:
            tenant = Tenant(
                tenant_id=f"tenant_{uuid.uuid4().hex[:12]}",
                name="openpadel",
                domain=DOMAIN,
                status="active",
                plan_id=DEFAULT_PLAN_ID,
            )
            session.add(tenant)
            await session.flush()
            print(f"Tenant creado: {tenant.tenant_id} (domain={DOMAIN})")
        else:
            print(f"Tenant ya existía: {tenant.tenant_id} (domain={DOMAIN})")
        tenant_id = tenant.tenant_id

        # 2) Usuario admin
        user = await session.get(User, ADMIN_USERNAME)
        if user is None:
            session.add(
                User(
                    username=ADMIN_USERNAME,
                    hashed_password=get_password_hash(ADMIN_PASSWORD),
                    tenant_id=tenant_id,
                    role="admin",
                    disabled=False,
                )
            )
            print(f"Usuario creado: {ADMIN_USERNAME}")
        else:
            print(f"Usuario ya existía: {ADMIN_USERNAME}")

        # 3) Bot
        bot_result = await session.execute(
            select(Bot).where(Bot.tenant_id == tenant_id, Bot.name == "openpadel")
        )
        bot = bot_result.scalars().first()
        if bot is None:
            bot = Bot(
                bot_id=f"bot_{uuid.uuid4().hex[:12]}",
                owner_id=ADMIN_USERNAME,
                tenant_id=tenant_id,
                name="openpadel",
                description="Asistente de reservas y consultas de OpenPadel",
                business_type="turnos",
                status="active",
                config={
                    "system_prompt": (
                        "Sos el asistente virtual de OpenPadel. "
                        "Ayudás a los socios a consultar disponibilidad, "
                        "reservar canchas y resolver dudas del club con "
                        "amabilidad y rapidez."
                    ),
                    "welcome_message": (
                        "¡Hola! Soy el asistente de OpenPadel 🎾 "
                        "¿Querés reservar una cancha o tenés alguna consulta?"
                    ),
                    "use_rag": False,
                },
                channel_ids=[],
                total_clients=0,
                total_conversations=0,
                total_messages=0,
                metadata_={},
            )
            session.add(bot)
            await session.flush()
            print(f"Bot creado: {bot.bot_id}")
        else:
            print(f"Bot ya existía: {bot.bot_id}")
        bot_id = bot.bot_id

        # 4) Canal web del tenant (chat de la landing /chat/c/<channel_id>)
        channel_result = await session.execute(
            select(Channel).where(
                Channel.bot_id == bot_id,
                Channel.channel_type == "web",
                Channel.owner_username.is_(None),
            )
        )
        channel = channel_result.scalars().first()
        if channel is None:
            channel = Channel(
                channel_id=f"channel_{uuid.uuid4().hex[:12]}",
                bot_id=bot_id,
                tenant_id=tenant_id,
                channel_type="web",
                name="Chat de consulta",
                status="active",
                web_config=None,
                webhook_url=None,
                total_messages_received=0,
                total_messages_sent=0,
                metadata_={},
            )
            channel.webhook_url = (
                f"wss://openpadel.pro/ws/chat/channel/{channel.channel_id}"
            )
            session.add(channel)
            await session.flush()
            print(f"Canal web creado: {channel.channel_id}")
        else:
            print(f"Canal web ya existía: {channel.channel_id}")

        # Vincular el canal al bot
        if channel.channel_id not in (bot.channel_ids or []):
            bot.channel_ids = [*(bot.channel_ids or []), channel.channel_id]

        await session.commit()
        print("─" * 50)
        print(f"TENANT_ID_OPENPADEL={tenant_id}")
        print(f"Bot ID:             {bot_id}")
        print(f"Channel ID:         {channel.channel_id}")
        print("─" * 50)
        print("➜  Copiar TENANT_ID_OPENPADEL en .env.prod y redeployar.")


if __name__ == "__main__":
    asyncio.run(main())
