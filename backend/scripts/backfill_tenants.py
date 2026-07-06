#!/usr/bin/env python3
"""
Backfill de tenants — Fase 3 de la estrategia multi-tenant (ver
docs/dev/DECISIONS.md). Crea un tenant por cada usuario existente (todo
usuario pre-multi-tenant era, en los hechos, un dueño/admin solitario de sus
propios bots), y propaga tenant_id hacia bots/channels/clients/conversations/
push_subscriptions a través del bot_id.

Uso (dentro del contenedor del backend):

    docker compose exec app python scripts/backfill_tenants.py

    # Para promover un usuario a super_admin (platform staff, sin tenant)
    # después del backfill:
    docker compose exec app env PROMOTE_SUPER_ADMIN=admin python scripts/backfill_tenants.py

Idempotente: sólo crea tenant para usuarios con tenant_id IS NULL, y sólo
propaga tenant_id donde todavía es NULL. Se puede correr más de una vez sin
duplicar ni pisar datos ya backfillados.

IMPORTANTE: este script NO decide por sí solo quién es "staff de la agencia"
(super_admin) — por defecto todos los usuarios existentes quedan como admin
de su propio tenant nuevo. Sin al menos un super_admin, nadie podrá usar los
endpoints de administración general una vez aplicado el enforcement de roles
(Fase 4). Usá PROMOTE_SUPER_ADMIN=<username> para marcar explícitamente a la
cuenta de staff correspondiente.
"""

import asyncio
import os
import re
import uuid

from sqlalchemy import select

from app.db.database import AsyncSessionLocal
from app.db.models import Bot, Channel, Client, Conversation, PushSubscription, Tenant, User


def _slugify(username: str) -> str:
    slug = re.sub(r"[^a-z0-9-]", "-", username.lower()).strip("-")
    return slug or "tenant"


def _new_tenant_id() -> str:
    return f"tenant_{uuid.uuid4().hex[:12]}"


async def _unique_slug(session, base_slug: str) -> str:
    """El slug no tiene constraint único hoy (sólo `domain` lo tiene), pero
    igual evitamos nombres duplicados obvios entre tenants nuevos."""
    result = await session.execute(select(Tenant.name))
    existing_names = {row[0] for row in result.all()}
    slug = base_slug
    counter = 1
    while slug in existing_names:
        slug = f"{base_slug}-{counter}"
        counter += 1
    return slug


async def main() -> None:
    promote_username = os.getenv("PROMOTE_SUPER_ADMIN")

    async with AsyncSessionLocal() as session:
        # 1. Un tenant por cada usuario sin tenant_id todavía.
        result = await session.execute(select(User).where(User.tenant_id.is_(None)))
        users_without_tenant = result.scalars().all()

        created = 0
        for user in users_without_tenant:
            slug = await _unique_slug(session, _slugify(user.username))
            tenant = Tenant(
                tenant_id=_new_tenant_id(),
                name=slug,
                status="active",
            )
            session.add(tenant)
            await session.flush()  # asegura tenant.tenant_id disponible para el FK

            user.tenant_id = tenant.tenant_id
            user.role = user.role or "admin"
            created += 1

        await session.commit()
        print(f"Tenants creados: {created} (usuarios sin tenant previo: {len(users_without_tenant)})")

        # 2. Propagar tenant_id: bots ← owner.tenant_id
        result = await session.execute(
            select(Bot).where(Bot.tenant_id.is_(None))
        )
        bots_to_update = result.scalars().all()
        bot_updates = 0
        owner_tenant_cache: dict[str, str | None] = {}
        for bot in bots_to_update:
            if bot.owner_id not in owner_tenant_cache:
                owner = await session.get(User, bot.owner_id)
                owner_tenant_cache[bot.owner_id] = owner.tenant_id if owner else None
            tenant_id = owner_tenant_cache[bot.owner_id]
            if tenant_id:
                bot.tenant_id = tenant_id
                bot_updates += 1
        await session.commit()
        print(f"Bots actualizados con tenant_id: {bot_updates}")

        # 3. Propagar tenant_id: channels/clients/conversations/push_subscriptions ← bot.tenant_id
        bot_tenant_map: dict[str, str | None] = {}
        result = await session.execute(select(Bot.bot_id, Bot.tenant_id))
        for bot_id, tenant_id in result.all():
            bot_tenant_map[bot_id] = tenant_id

        for model, label in (
            (Channel, "channels"),
            (Client, "clients"),
            (Conversation, "conversations"),
            (PushSubscription, "push_subscriptions"),
        ):
            result = await session.execute(select(model).where(model.tenant_id.is_(None)))
            rows = result.scalars().all()
            updated = 0
            for row in rows:
                tenant_id = bot_tenant_map.get(row.bot_id)
                if tenant_id:
                    row.tenant_id = tenant_id
                    updated += 1
            await session.commit()
            print(f"{label} actualizados con tenant_id: {updated}")

        # 4. Promoción opcional a super_admin.
        if promote_username:
            user = await session.get(User, promote_username)
            if not user:
                print(f"⚠️  Usuario '{promote_username}' no encontrado, no se promovió.")
            else:
                user.role = "super_admin"
                user.tenant_id = None
                await session.commit()
                print(f"✅ '{promote_username}' promovido a super_admin (sin tenant).")

    print("Backfill completo.")


if __name__ == "__main__":
    asyncio.run(main())
