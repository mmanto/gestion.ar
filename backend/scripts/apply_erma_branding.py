#!/usr/bin/env python3
"""
Configura el branding del tenant ERMA: branding.industry = 'salud'.

Es el dato de negocio que hace que el Escritorio del frontend-tenant oculte
los cards del semáforo de leads (Viable/Potencial/Exploración) y muestre en
su lugar el calendario de turnos del consultorio — la vista del Dashboard
depende de `tenant.branding.industry === 'salud'` (ver
frontend-tenant/src/pages/Dashboard.tsx, `isSalud`). El código ya viaja en
el bundle; lo que faltaba en el tenant es este campo en la base.

Uso (dentro del contenedor del backend):

    docker compose exec app python scripts/apply_erma_branding.py

Idempotente: re-aplicar es seguro (deja `industry` en 'salud' y no toca el
resto del branding: color, logo, tagline, template…).
"""

import asyncio

from sqlalchemy import select

from app.db.database import AsyncSessionLocal
from app.db.models import Tenant

# Cubre prod (erma.com.ar) y local (erma.com.test), por si se corre en ambos.
ERMA_DOMAIN_SUFFIX = "erma.com"


async def main() -> None:
    async with AsyncSessionLocal() as session:
        rows = (await session.execute(select(Tenant))).scalars().all()
        targets = [
            t for t in rows
            if (t.domain or "").startswith(ERMA_DOMAIN_SUFFIX) or (t.name or "").upper() == "ERMA"
        ]

        if not targets:
            print("❌ No se encontró ningún tenant ERMA — nada que aplicar.")
            return

        applied = []
        for tenant in targets:
            branding = dict(tenant.branding or {})
            old = branding.get("industry")
            branding["industry"] = "salud"
            tenant.branding = branding
            applied.append((tenant, old))

        await session.commit()

        for tenant, old in applied:
            print(
                f"✅ Tenant {tenant.tenant_id} ({tenant.name}, {tenant.domain or '-'}) "
                f"branding.industry: {old!r} -> 'salud'"
            )


if __name__ == "__main__":
    asyncio.run(main())
