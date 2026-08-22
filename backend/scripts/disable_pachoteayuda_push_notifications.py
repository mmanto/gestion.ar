#!/usr/bin/env python3
"""
Desactiva las notificaciones push en el chat de pachoteayuda: pone
`config.push_notifications_enabled = False` en todos los bots de los tenants
pachoteayuda (pachoteayuda.ar) e ipachoteayuda (pachoteayuda.intellify.pro, el
chat embebido en la landing de César Pacho). Con el flag en False, el chat del
cliente deja de mostrar el botón "Recibir notificaciones" (ver
BotConfig.push_notifications_enabled).

Uso (dentro del contenedor del backend):

    docker compose exec app python scripts/disable_pachoteayuda_push_notifications.py

Idempotente: re-ejecutarlo es seguro (ya aplicado → no cambia nada).
"""

import asyncio

from sqlalchemy import select

from app.db.database import AsyncSessionLocal
from app.db.models import Bot

# ipachoteayuda → pachoteayuda.intellify.pro (chat embebido en la landing de
# César Pacho, canal channel_96ad03bc1a1d). pachoteayuda → pachoteayuda.ar.
PACHOTEAYUDA_TENANT_IDS = [
    "tenant_2fc38a44e696",  # ipachoteayuda (verificado en prod 2026-08-16)
    "tenant_7099f777c4d8",  # pachoteayuda
]


async def main() -> None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Bot).where(Bot.tenant_id.in_(PACHOTEAYUDA_TENANT_IDS))
        )
        bots = result.scalars().all()

        if not bots:
            print(f"⚠️  No hay bots para los tenants {PACHOTEAYUDA_TENANT_IDS} — nada que aplicar.")
            return

        updated = 0
        for row in bots:
            config = dict(row.config or {})
            was = config.get("push_notifications_enabled", True)
            config["push_notifications_enabled"] = False
            row.config = config
            updated += 1
            print(f"   bot {row.bot_id} ({row.name}): push_notifications_enabled {was!r} -> False")

        await session.commit()
        print(f"✅ {updated} bot(s) de pachoteayuda con push desactivado")


if __name__ == "__main__":
    asyncio.run(main())