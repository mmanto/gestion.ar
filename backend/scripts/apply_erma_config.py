#!/usr/bin/env python3
"""
Aplica al bot ERMA las configuraciones del agente y del registro de turnos,
usando como fuente de verdad los JSON versionados en docs/:

1. config.ius_config                        <- docs/erma_ius_config.json
   (system prompt estructurado del agente: identidad, HOW_TO_USE, flujo_de_turno...)
2. metadata.appointments.default_info_fields <- docs/turnos.json -> info_fields
   (datos que el flujo iniciar_reserva_turno pide antes del calendario:
    nombre completo, DNI y WhatsApp — keys well-known para que se vuelquen
    al Client del backoffice)

El script hace merge: no pisa claves existentes de metadata.appointments
(service_ids, resource_ids, enabled_in_chat, default_service_id...).

Uso (dentro del contenedor del backend):

    docker compose exec app python scripts/apply_erma_config.py

Idempotente: re-aplicar es seguro (los JSON de docs siguen siendo la fuente).
"""

import asyncio
import json
from pathlib import Path

from sqlalchemy import select

from app.db.database import AsyncSessionLocal
from app.db.models import Bot

BOT_ID = "bot_4f50d0c6079c"  # bot "ERMA"
DOCS_DIR = Path("/app/documents")  # el contenedor monta ./docs -> /app/documents

ERMA_AGENT_JSON = DOCS_DIR / "erma_ius_config.json"
TURNOS_JSON = DOCS_DIR / "turnos.json"


def load_json(path: Path) -> dict:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


async def main() -> None:
    agent_config = load_json(ERMA_AGENT_JSON)
    turnos_config = load_json(TURNOS_JSON)
    info_fields = turnos_config.get("info_fields")

    if not info_fields:
        print(f"❌ {TURNOS_JSON.name}: falta la lista 'info_fields' — nada que aplicar.")
        return

    async with AsyncSessionLocal() as session:
        row = await session.get(Bot, BOT_ID)
        if row is None:
            print(f"❌ Bot {BOT_ID} no encontrado — nada que aplicar.")
            return

        # ── 1) System prompt del agente ──────────────────────────────────
        config = dict(row.config or {})
        old_identity = (config.get("ius_config") or {}).get("agent_identity") or {}
        new_identity = agent_config.get("agent_identity") or {}
        config["ius_config"] = agent_config
        row.config = config

        # ── 2) Datos del registro de turnos (merge) ──────────────────────
        appointments = dict((row.metadata_ or {}).get("appointments") or {})
        old_fields = appointments.get("default_info_fields")
        appointments["default_info_fields"] = info_fields
        metadata = dict(row.metadata_ or {})
        metadata["appointments"] = appointments
        row.metadata_ = metadata

        await session.commit()

        print(f"✅ Bot {BOT_ID} ({row.name}) actualizado")
        print(f"   ius_config.agent_identity.nombre: {old_identity.get('nombre')!r} -> {new_identity.get('nombre')!r}")
        print(f"   appointments.default_info_fields: {len(old_fields) if old_fields else 0} campos -> {len(info_fields)} campos")
        print(f"      keys: {[f.get('key') for f in info_fields]}")
        print("   (se conservaron las demás claves de appointments:",
              sorted(k for k in appointments if k != "default_info_fields"), ")")


if __name__ == "__main__":
    asyncio.run(main())
