#!/usr/bin/env python3
"""
Migra los clientes existentes de MongoDB (colección `clients`) a PostgreSQL
(tabla `clients`), como parte del cutover de ClientService a Postgres
(ADR-006, ver docs/dev/DECISIONS.md).

Uso (dentro del contenedor del backend):

    docker compose exec app python scripts/migrate_clients_to_postgres.py

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
from app.db.models import Client


def _parse_iso(value):
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


async def main() -> None:
    mongodb_uri = os.getenv("MONGODB_URI", "mongodb://mongo:27017/gestionar")
    client = AsyncIOMotorClient(mongodb_uri)
    db = client.get_default_database()

    docs = await db.clients.find({}, {"_id": 0}).to_list(length=None)
    print(f"Clientes encontrados en Mongo: {len(docs)}")

    if not docs:
        print("Nada para migrar.")
        client.close()
        return

    async with AsyncSessionLocal() as session:
        for doc in docs:
            values = {
                "client_id": doc["client_id"],
                "bot_id": doc["bot_id"],
                "external_id": doc["external_id"],
                "source": doc.get("source", "manual"),
                "name": doc.get("name"),
                "email": doc.get("email"),
                "phone": doc.get("phone"),
                "status": doc.get("status", "active"),
                "score": doc.get("score", 0.0),
                "total_conversations": doc.get("total_conversations", 0),
                "total_messages": doc.get("total_messages", 0),
                "total_tokens_used": doc.get("total_tokens_used", 0),
                "metadata_": doc.get("metadata"),
            }
            for field in ("first_contact_at", "last_contact_at"):
                parsed = _parse_iso(doc.get(field))
                if parsed:
                    values[field] = parsed

            stmt = pg_insert(Client).values(**values)
            # set_= no traduce alias Python (metadata_ -> columna "metadata"),
            # a diferencia de .values(); se arma contra las columnas reales.
            update_cols = {
                col.name: stmt.excluded[col.name]
                for col in Client.__table__.columns
                if col.name != "client_id"
            }
            stmt = stmt.on_conflict_do_update(index_elements=["client_id"], set_=update_cols)
            await session.execute(stmt)

        await session.commit()

    client.close()
    print(f"✅ {len(docs)} cliente(s) migrado(s) a PostgreSQL.")


if __name__ == "__main__":
    asyncio.run(main())
