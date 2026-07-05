#!/usr/bin/env python3
"""
Migra los bots existentes de MongoDB (colección `bots`) a PostgreSQL (tabla
`bots`), como parte del cutover de BotService a Postgres (ADR-006, ver
docs/dev/DECISIONS.md).

Uso (dentro del contenedor del backend):

    docker compose exec app python scripts/migrate_bots_to_postgres.py

Idempotente: usa upsert (ON CONFLICT DO UPDATE), se puede correr más de una
vez sin duplicar filas. No migra el campo legacy `channels` (embebido, vacío
en la práctica). Mongo no se modifica ni se borra — queda como respaldo de
rollback.
"""

import asyncio
import os
from datetime import datetime

from motor.motor_asyncio import AsyncIOMotorClient
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.database import AsyncSessionLocal
from app.db.models import Bot


def _parse_iso(value):
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


async def main() -> None:
    mongodb_uri = os.getenv("MONGODB_URI", "mongodb://mongo:27017/gestionar")
    client = AsyncIOMotorClient(mongodb_uri)
    db = client.get_default_database()

    docs = await db.bots.find({}, {"_id": 0}).to_list(length=None)
    print(f"Bots encontrados en Mongo: {len(docs)}")

    if not docs:
        print("Nada para migrar.")
        client.close()
        return

    async with AsyncSessionLocal() as session:
        for doc in docs:
            values = {
                "bot_id": doc["bot_id"],
                "owner_id": doc["owner_id"],
                "name": doc["name"],
                "description": doc.get("description"),
                "business_type": doc["business_type"],
                "status": doc.get("status", "active"),
                "config": doc.get("config", {}),
                "metadata_": doc.get("metadata"),
                "channel_ids": doc.get("channel_ids", []),
                "total_clients": doc.get("total_clients", 0),
                "total_conversations": doc.get("total_conversations", 0),
                "total_messages": doc.get("total_messages", 0),
            }
            for field in ("created_at", "updated_at"):
                parsed = _parse_iso(doc.get(field))
                if parsed:
                    values[field] = parsed

            stmt = pg_insert(Bot).values(**values)
            # set_= no traduce alias Python (metadata_ -> columna "metadata"),
            # a diferencia de .values(); se arma contra las columnas reales.
            update_cols = {
                col.name: stmt.excluded[col.name]
                for col in Bot.__table__.columns
                if col.name != "bot_id"
            }
            stmt = stmt.on_conflict_do_update(index_elements=["bot_id"], set_=update_cols)
            await session.execute(stmt)

        await session.commit()

    client.close()
    print(f"✅ {len(docs)} bot(s) migrado(s) a PostgreSQL.")


if __name__ == "__main__":
    asyncio.run(main())
