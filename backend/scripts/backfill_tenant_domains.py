#!/usr/bin/env python3
"""
Backfill de `domain` y `settings` de tenants — colapso a un único contenedor
frontend-tenant (ADR en docs/dev/DECISIONS.md).

Con el colapso, el tenant se resuelve por el Host de la request contra
`tenants.domain` (endpoint GET /api/public/tenants/current). Este script
setea el domain canónico de cada tenant activo (fuente de verdad: los Host()
de docker-compose.tenants.prod.yml) y el flag de runtime de ius
(stats_two_cols_mobile, que antes se inyectaba por contenedor via
STATS_TWO_COLS_MOBILE).

Idempotente: matchea por name (case-insensitive) y sólo pisa domain/settings
del tenant que encuentra. Si un tenant no aparece, lo informa para setear el
domain a mano en el panel admin.

Uso (dentro del contenedor del backend):

    docker compose exec app python scripts/backfill_tenant_domains.py
"""

import asyncio

from sqlalchemy import func, select

from app.db.database import AsyncSessionLocal
from app.db.models import Tenant

# name (case-insensitive) -> domain canónico
DOMAIN_BY_NAME = {
    "ius": "ius.intellify.pro",
    "laboralia": "laboralia.intellify.pro",
    "proptech": "proptech.intellify.pro",
    "erma": "erma.com.ar",
    "pachoteayuda": "pachoteayuda.ar",
    "openpadel": "openpadel.pro",
}

IUS_SETTINGS = {"stats_two_cols_mobile": True}


async def main() -> None:
    async with AsyncSessionLocal() as session:
        for name, domain in DOMAIN_BY_NAME.items():
            result = await session.execute(
                select(Tenant).where(func.lower(Tenant.name) == name.lower())
            )
            tenants = result.scalars().all()
            if not tenants:
                print(f"⚠️  No se encontró tenant name~{name!r} — setear domain={domain!r} a mano.")
                continue
            if len(tenants) > 1:
                print(f"⚠️  {len(tenants)} tenants matchean name~{name!r}; se actualiza el primero.")
            tenant = tenants[0]
            tenant.domain = domain
            if name == "ius":
                tenant.settings = {**(tenant.settings or {}), **IUS_SETTINGS}
            print(
                f"✓ {tenant.tenant_id} name={tenant.name!r} "
                f"-> domain={domain!r} settings={tenant.settings!r}"
            )
        await session.commit()
        print("Backfill de domain/settings completo.")


if __name__ == "__main__":
    asyncio.run(main())
