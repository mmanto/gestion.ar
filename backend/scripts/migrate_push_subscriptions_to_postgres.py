#!/usr/bin/env python3
"""
Migra las suscripciones push existentes de MongoDB (colección
`push_subscriptions`) a PostgreSQL (tabla `push_subscriptions`), como parte
del cutover de PushService a Postgres (ADR-006, ver docs/dev/DECISIONS.md).

Uso (dentro del contenedor del backend):

    docker compose exec app python scripts/migrate_push_subscriptions_to_postgres.py

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
from app.db.models import PushSubscription


def _parse_iso(value):
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


async def main() -> None:
    mongodb_uri = os.getenv("MONGODB_URI", "mongodb://mongo:27017/gestionar")
    client = AsyncIOMotorClient(mongodb_uri)
    db = client.get_default_database()

    docs = await db.push_subscriptions.find({}, {"_id": 0}).to_list(length=None)
    print(f"Suscripciones push encontradas en Mongo: {len(docs)}")

    if not docs:
        print("Nada para migrar.")
        client.close()
        return

    async with AsyncSessionLocal() as session:
        for doc in docs:
            values = {
                "subscription_id": doc["subscription_id"],
                "bot_id": doc["bot_id"],
                "channel_id": doc.get("channel_id"),
                "client_id": doc.get("client_id"),
                "endpoint": doc["endpoint"],
                "p256dh": doc["p256dh"],
                "auth": doc["auth"],
                "user_agent": doc.get("user_agent"),
                "is_active": doc.get("is_active", True),
                "expiration_time": doc.get("expiration_time"),
            }
            for field in ("created_at", "last_used_at"):
                parsed = _parse_iso(doc.get(field))
                if parsed:
                    values[field] = parsed

            stmt = pg_insert(PushSubscription).values(**values)
            update_cols = {
                col.name: stmt.excluded[col.name]
                for col in PushSubscription.__table__.columns
                if col.name != "subscription_id"
            }
            stmt = stmt.on_conflict_do_update(index_elements=["subscription_id"], set_=update_cols)
            await session.execute(stmt)

        await session.commit()

    client.close()
    print(f"✅ {len(docs)} suscripción(es) push migrada(s) a PostgreSQL.")


if __name__ == "__main__":
    asyncio.run(main())
