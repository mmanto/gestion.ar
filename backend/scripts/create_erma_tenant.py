#!/usr/bin/env python3
"""
Migración puntual: separa el bot ERMA (hoy dentro del tenant personal
martin-mantovani) a su propio tenant, con domain=erma.com.ar — para poder
simular ruteo por dominio local (erma.com.test) igual que ya existe para
IUS Legal (ius.com.mx / ius.mx.test).

Uso (dentro del contenedor del backend):

    docker compose exec app python scripts/create_erma_tenant.py

Idempotente: si el tenant "ERMA" ya existe (por domain), no lo vuelve a crear.
"""

import asyncio

from sqlalchemy import select

from app.auth_service import get_password_hash
from app.db.database import AsyncSessionLocal
from app.db.models import Bot, Channel, Client, Conversation, PushSubscription, Tenant, User

BOT_ID = "bot_4f50d0c6079c"  # bot "ERMA"
DOMAIN = "erma.com.ar"
ADMIN_USERNAME = "erma_admin"
ADMIN_PASSWORD = "erma123456"


async def main() -> None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Tenant).where(Tenant.domain == DOMAIN))
        tenant = result.scalars().first()

        if tenant is None:
            import uuid

            tenant = Tenant(
                tenant_id=f"tenant_{uuid.uuid4().hex[:12]}",
                name="ERMA",
                domain=DOMAIN,
                status="active",
            )
            session.add(tenant)
            await session.flush()
            print(f"Tenant creado: {tenant.tenant_id} (domain={DOMAIN})")
        else:
            print(f"Tenant ya existía: {tenant.tenant_id} (domain={DOMAIN})")

        tenant_id = tenant.tenant_id

        existing_admin = await session.get(User, ADMIN_USERNAME)
        if existing_admin is None:
            session.add(
                User(
                    username=ADMIN_USERNAME,
                    hashed_password=get_password_hash(ADMIN_PASSWORD),
                    tenant_id=tenant_id,
                    role="admin",
                    disabled=False,
                )
            )
            print(f"Usuario creado: {ADMIN_USERNAME} (tenant={tenant_id})")
        else:
            print(f"Usuario ya existía: {ADMIN_USERNAME}")

        bot = await session.get(Bot, BOT_ID)
        if bot is None:
            print(f"⚠️  Bot {BOT_ID} no encontrado — nada para mover.")
            await session.commit()
            return

        old_tenant_id = bot.tenant_id
        bot.tenant_id = tenant_id

        moved = {"channels": 0, "clients": 0, "conversations": 0, "push_subscriptions": 0}
        for model, label in (
            (Channel, "channels"),
            (Client, "clients"),
            (Conversation, "conversations"),
            (PushSubscription, "push_subscriptions"),
        ):
            result = await session.execute(select(model).where(model.bot_id == BOT_ID))
            rows = result.scalars().all()
            for row in rows:
                row.tenant_id = tenant_id
            moved[label] = len(rows)

        await session.commit()

        print(f"Bot {BOT_ID} movido: {old_tenant_id} -> {tenant_id}")
        for label, count in moved.items():
            print(f"{label} actualizados: {count}")

    print("Migración completa.")


if __name__ == "__main__":
    asyncio.run(main())
