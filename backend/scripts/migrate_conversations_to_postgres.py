#!/usr/bin/env python3
"""
Migra las conversaciones existentes de MongoDB (colección `conversations`,
incluyendo su array embebido `messages`) a PostgreSQL (tablas `conversations`
y `messages`), como parte del cutover de ConversationService a Postgres
(ADR-006, ver docs/dev/DECISIONS.md).

Uso (dentro del contenedor del backend):

    docker compose exec app python scripts/migrate_conversations_to_postgres.py

Idempotente: las conversaciones usan upsert (ON CONFLICT DO UPDATE); los
mensajes de cada conversación se borran y reinsertan en cada corrida (no
tienen una clave natural propia en el origen). Mongo no se modifica ni se
borra — queda como respaldo de rollback. La colección vestigial `messages`
(singular, separada) no se migra.
"""

import asyncio
import os
from datetime import datetime

from motor.motor_asyncio import AsyncIOMotorClient
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.database import AsyncSessionLocal
from app.db.models import Conversation, Message


def _parse_iso(value):
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


async def main() -> None:
    mongodb_uri = os.getenv("MONGODB_URI", "mongodb://mongo:27017/gestionar")
    client = AsyncIOMotorClient(mongodb_uri)
    db = client.get_default_database()

    docs = await db.conversations.find({}, {"_id": 0}).to_list(length=None)
    print(f"Conversaciones encontradas en Mongo: {len(docs)}")

    if not docs:
        print("Nada para migrar.")
        client.close()
        return

    total_messages = 0

    async with AsyncSessionLocal() as session:
        for doc in docs:
            metadata = doc.get("metadata") or {}
            values = {
                "conversation_id": doc["conversation_id"],
                "bot_id": doc.get("bot_id"),
                "client_id": doc.get("client_id"),
                "user_id": doc["user_id"],
                "channel": doc.get("channel"),
                "source": metadata.get("source"),
                "channel_id": metadata.get("channel_id"),
                "total_tokens_used": doc.get("total_tokens_used", 0),
                "total_cost_usd": doc.get("total_cost_usd", 0),
                "metadata_": metadata,
            }
            for field in ("created_at", "updated_at"):
                parsed = _parse_iso(doc.get(field))
                if parsed:
                    values[field] = parsed

            stmt = pg_insert(Conversation).values(**values)
            update_cols = {
                col.name: stmt.excluded[col.name]
                for col in Conversation.__table__.columns
                if col.name != "conversation_id"
            }
            stmt = stmt.on_conflict_do_update(index_elements=["conversation_id"], set_=update_cols)
            await session.execute(stmt)

            # Mensajes embebidos: se borran y reinsertan para que el script
            # sea re-ejecutable sin duplicar (no hay clave natural en origen).
            await session.execute(
                delete(Message).where(Message.conversation_id == doc["conversation_id"])
            )
            for msg in doc.get("messages", []):
                timestamp = _parse_iso(msg.get("timestamp")) or datetime.utcnow()
                await session.execute(
                    pg_insert(Message).values(
                        conversation_id=doc["conversation_id"],
                        role=msg["role"],
                        content=msg["content"],
                        timestamp=timestamp,
                        metadata_=msg.get("metadata") or {},
                    )
                )
                total_messages += 1

        await session.commit()

    client.close()
    print(f"✅ {len(docs)} conversación(es) y {total_messages} mensaje(s) migrados a PostgreSQL.")


if __name__ == "__main__":
    asyncio.run(main())
