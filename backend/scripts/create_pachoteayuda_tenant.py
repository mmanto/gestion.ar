#!/usr/bin/env python3
"""
Alta de tenant "pachoteayuda" con dominio propio pachoteayuda.ar (mismo
procedimiento que create_erma_tenant.py, pero para un tenant nuevo, sin
mover un bot existente).

Crea el tenant (name=pachoteayuda, domain=pachoteayuda.ar, plan por defecto)
y su usuario admin. Idempotente: si el tenant ya existe por domain, no lo
vuelve a crear.

Uso (dentro del contenedor del backend):

    docker compose exec app python scripts/create_pachoteayuda_tenant.py
"""

import asyncio
import uuid

from sqlalchemy import select

from app.auth_service import get_password_hash
from app.db.database import AsyncSessionLocal
from app.db.models import Tenant, User

DOMAIN = "pachoteayuda.ar"
DEFAULT_PLAN_ID = "plan_000000000000"  # Plan Básico por defecto (mismos tenants existentes)
ADMIN_USERNAME = "pachoteayuda_admin"
ADMIN_PASSWORD = "pachoteayuda123456"


async def main() -> None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Tenant).where(Tenant.domain == DOMAIN))
        tenant = result.scalars().first()

        if tenant is None:
            tenant = Tenant(
                tenant_id=f"tenant_{uuid.uuid4().hex[:12]}",
                name="pachoteayuda",
                domain=DOMAIN,
                status="active",
                plan_id=DEFAULT_PLAN_ID,
            )
            session.add(tenant)
            await session.flush()
            print(f"Tenant creado: {tenant.tenant_id} (name=pachoteayuda, domain={DOMAIN})")
        else:
            print(f"Tenant ya existía: {tenant.tenant_id} (domain={DOMAIN})")

        existing_admin = await session.get(User, ADMIN_USERNAME)
        if existing_admin is None:
            session.add(
                User(
                    username=ADMIN_USERNAME,
                    hashed_password=get_password_hash(ADMIN_PASSWORD),
                    tenant_id=tenant.tenant_id,
                    role="admin",
                    disabled=False,
                )
            )
            print(f"Usuario creado: {ADMIN_USERNAME} (tenant={tenant.tenant_id})")
        else:
            print(f"Usuario ya existía: {ADMIN_USERNAME}")

        await session.commit()
        print(f"Tenant ID: {tenant.tenant_id}")


if __name__ == "__main__":
    asyncio.run(main())