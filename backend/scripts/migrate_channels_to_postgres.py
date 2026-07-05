#!/usr/bin/env python3
"""
Migra los canales existentes de MongoDB (colección `channels`) a PostgreSQL
(tabla `channels`), como parte del cutover de ChannelService a Postgres
(ADR-006, ver docs/dev/DECISIONS.md).

Uso (dentro del contenedor del backend):

    docker compose exec app python scripts/migrate_channels_to_postgres.py

Idempotente: usa upsert (ON CONFLICT DO UPDATE), se puede correr más de una
vez sin duplicar filas. Mongo no se modifica ni se borra — queda como
respaldo de rollback.
"""

import asyncio
import os
from datetime import datetime

from motor.motor_asyncio import AsyncIOMotorClient
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.database import AsyncSessionLocal
from app.db.models import Channel


def _parse_iso(value):
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


async def main() -> None:
    mongodb_uri = os.getenv("MONGODB_URI", "mongodb://mongo:27017/gestionar")
    client = AsyncIOMotorClient(mongodb_uri)
    db = client.get_default_database()

    docs = await db.channels.find({}, {"_id": 0}).to_list(length=None)
    print(f"Canales encontrados en Mongo: {len(docs)}")

    if not docs:
        print("Nada para migrar.")
        client.close()
        return

    async with AsyncSessionLocal() as session:
        for doc in docs:
            values = {
                "channel_id": doc["channel_id"],
                "bot_id": doc["bot_id"],
                "channel_type": doc["channel_type"],
                "name": doc["name"],
                "status": doc.get("status", "pending"),
                "whatsapp_config": doc.get("whatsapp_config"),
                "telegram_config": doc.get("telegram_config"),
                "web_config": doc.get("web_config"),
                "pwa_config": doc.get("pwa_config"),
                "webhook_url": doc.get("webhook_url"),
                "total_messages_received": doc.get("total_messages_received", 0),
                "total_messages_sent": doc.get("total_messages_sent", 0),
                "metadata_": doc.get("metadata"),
            }
            for field in ("created_at", "updated_at", "last_activity_at"):
                parsed = _parse_iso(doc.get(field))
                if parsed:
                    values[field] = parsed

            stmt = pg_insert(Channel).values(**values)
            # set_= no traduce alias Python (metadata_ -> columna "metadata"),
            # a diferencia de .values(); se arma contra las columnas reales.
            update_cols = {
                col.name: stmt.excluded[col.name]
                for col in Channel.__table__.columns
                if col.name != "channel_id"
            }
            stmt = stmt.on_conflict_do_update(index_elements=["channel_id"], set_=update_cols)
            await session.execute(stmt)

        await session.commit()

    client.close()
    print(f"✅ {len(docs)} canal(es) migrado(s) a PostgreSQL.")


if __name__ == "__main__":
    asyncio.run(main())
