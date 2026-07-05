#!/usr/bin/env python3
"""
Migra los usuarios existentes de MongoDB (colección `users`) a PostgreSQL
(tabla `users`), como parte del cutover de UserService a Postgres (ADR-006,
ver docs/dev/DECISIONS.md).

Uso (dentro del contenedor del backend):

    docker compose exec app python scripts/migrate_users_to_postgres.py

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
from app.db.models import User


def _parse_iso(value):
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


async def main() -> None:
    mongodb_uri = os.getenv("MONGODB_URI", "mongodb://mongo:27017/gestionar")
    client = AsyncIOMotorClient(mongodb_uri)
    db = client.get_default_database()

    docs = await db.users.find({}, {"_id": 0}).to_list(length=None)
    print(f"Usuarios encontrados en Mongo: {len(docs)}")

    if not docs:
        print("Nada para migrar.")
        client.close()
        return

    async with AsyncSessionLocal() as session:
        for doc in docs:
            values = {
                "username": doc["username"],
                "email": doc.get("email"),
                "hashed_password": doc["hashed_password"],
                "disabled": doc.get("disabled", False),
                "auth_provider": doc.get("auth_provider"),
                "provider_user_id": doc.get("provider_user_id"),
                "google_id": doc.get("google_id"),
                "nango_connection_id": doc.get("nango_connection_id"),
                "gmail_sender_email": doc.get("gmail_sender_email"),
            }
            # created_at: se omite si Mongo no lo tiene (caso real hoy), para
            # que el server_default de Postgres (now()) lo complete.
            created_at = _parse_iso(doc.get("created_at"))
            if created_at:
                values["created_at"] = created_at

            stmt = pg_insert(User).values(**values)
            update_cols = {k: v for k, v in values.items() if k != "username"}
            stmt = stmt.on_conflict_do_update(index_elements=["username"], set_=update_cols)
            await session.execute(stmt)

        await session.commit()

    client.close()
    print(f"✅ {len(docs)} usuario(s) migrado(s) a PostgreSQL.")


if __name__ == "__main__":
    asyncio.run(main())
