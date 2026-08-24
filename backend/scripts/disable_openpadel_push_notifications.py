#!/usr/bin/env python3
"""
Desactiva las notificaciones push en el chat de openpadel (openpadel.pro, el
chat embebido en la landing): pone `config.push_notifications_enabled = False`
en el bot del canal web/PWA de la landing (`channel_9c867a601ecf`). Con el flag
en False, el chat del cliente deja de mostrar el botón "Recibir notificaciones"
(ver BotConfig.push_notifications_enabled).

Nota: en ChatPage el mismo flag agrupa el prompt de instalación PWA
(InstallButton) y el de notificaciones (PushNotificationButton), así que ambos
dejan de mostrarse en el chat de openpadel al aplicar este script.

Uso (dentro del contenedor del backend):

    docker compose exec app python scripts/disable_openpadel_push_notifications.py

Idempotente: re-ejecutarlo es seguro (ya aplicado → no cambia nada).
"""

import asyncio

from sqlalchemy import select

from app.db.database import AsyncSessionLocal
from app.db.models import Bot, Channel

# Canal de la landing openpadel (verificado en prod 2026-08-24, activo).
OPENPADEL_CHANNEL_IDS = ["channel_9c867a601ecf"]


async def main() -> None:
    async with AsyncSessionLocal() as session:
        chan_result = await session.execute(
            select(Channel).where(Channel.channel_id.in_(OPENPADEL_CHANNEL_IDS))
        )
        channels = chan_result.scalars().all()
        bot_ids = {c.bot_id for c in channels if c.bot_id}

        if not bot_ids:
            print(f"⚠️  No se encontraron bots para los canales {OPENPADEL_CHANNEL_IDS} — nada que aplicar.")
            return

        bots = (
            await session.execute(select(Bot).where(Bot.bot_id.in_(bot_ids)))
        ).scalars().all()

        updated = 0
        for row in bots:
            config = dict(row.config or {})
            was = config.get("push_notifications_enabled", True)
            config["push_notifications_enabled"] = False
            row.config = config
            updated += 1
            print(f"   bot {row.bot_id} ({row.name}): push_notifications_enabled {was!r} -> False")

        await session.commit()
        print(f"✅ {updated} bot(s) de openpadel con push desactivado")


if __name__ == "__main__":
    asyncio.run(main())