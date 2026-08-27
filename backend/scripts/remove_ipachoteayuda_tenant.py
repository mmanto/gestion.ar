#!/usr/bin/env python3
"""
Elimina el tenant ipachoteayuda (dominio pachoteayuda.intellify.pro) y todos
sus datos asociados, dejando solo el tenant de Pacho que sirve al dominio
propio del cliente pachoteayuda.ar.

Contexto (ver docs/ops/DEPLOYMENT.md): el negocio de Pacho quedó unificado en
un único tenant el del dominio propio pachoteayuda.ar. El tenant del
subdominio ipachoteayuda (pachoteayuda.intellify.pro) se marca para borrado.

Protección (NUNCA borra el tenant que sirve a pachoteayuda.ar):
  - KEEP_TENANT_ID es el tenant que sirve al dominio propio en prod
    (tenant_2fc38a44e696, "Pacho te ayuda"). Nunca se toca, aunque su
    relation coincida con el criterio que cae.
  - IDs/documentos legacy que no existen en la DB son ignorados con aviso.

Uso (dentro del contenedor del backend):

    docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml \
      exec app python scripts/remove_ipachoteayuda_tenant.py

Idempotente: si no encuentra el tenant objetivo, no borra nada y avisa.

Advertencia de alcance: borra datos de negocio en cascada explícita (canal,
conversaciones, clientes, push_subscriptions, bots, usuario admin). Revisar
el log antes de correr en prod. Orientado a ejecutarse UNA vez en el server.
"""

import asyncio

from sqlalchemy import func, select

from app.db.database import AsyncSessionLocal
from app.db.models import (
    Bot,
    Channel,
    Client,
    Conversation,
    PushSubscription,
    Tenant,
    User,
)

# Tenant vivo que sirve al dominio pachoteayuda.ar — NUNCA se borra.
KEEP_TENANT_ID = "tenant_2fc38a44e696"

# Objetivo: cualquier tenant que represente al subdominio ipachoteayuda.
# - Por dominio: exactamente pachoteayuda.intellify.pro
# - Por id legado: los ids que alguna vez se documentaron para ipachoteayuda
#   (algunos ya no existen en la DB; se avisa y se ignora).
TARGET_DOMAINS = ("pachoteayuda.intellify.pro",)
TARGET_TENANT_IDS = {"tenant_9ef2a8bdd6b7", "tenant_7099f777c4d8"}


async def _count_dependents(session, tenant_id: str) -> dict:
    counts = {}
    for label, model in [
        ("push_subscriptions", PushSubscription),
        ("channels", Channel),
        ("conversations", Conversation),
        ("clients", Client),
        ("bots", Bot),
        ("users", User),
    ]:
        counts[label] = (
            await session.execute(
                select(func.count()).select_from(model).where(model.tenant_id == tenant_id)
            )
        ).scalar_one()
    return counts


async def _delete_dependents(session, tenant_id: str) -> dict:
    """Borra datos dependientes del tenant. Orden explícito: primero lo que
    refencia bot/channel, después los bots (firma/channel_ids apuntan ahí)."""
    deleted = {}
    for label, model in [
        ("push_subscriptions", PushSubscription),
        ("channels", Channel),
        ("conversations", Conversation),
        ("clients", Client),
        ("bots", Bot),
    ]:
        rows = (
            await session.execute(select(model).where(model.tenant_id == tenant_id))
        ).scalars().all()
        if rows:
            for r in rows:
                await session.delete(r)
            deleted[label] = len(rows)
    # Usuarios del tenant
    users = (
        await session.execute(select(User).where(User.tenant_id == tenant_id))
    ).scalars().all()
    for u in users:
        await session.delete(u)
    deleted["users"] = len(users)
    return deleted


async def main() -> None:
    async with AsyncSessionLocal() as session:
        # 1) Buscar el tenant objetivo (protegido del KEEP)
        result = await session.execute(
            select(Tenant).where(
                Tenant.domain.is_not(None),
                Tenant.domain.in_(TARGET_DOMAINS),
                Tenant.tenant_id != KEEP_TENANT_ID,
            )
        )
        by_domain = result.scalars().all()

        tenants_to_delete = [t for t in by_domain]

        # Añadir los ids legacy que existan (y no coinciden con el KEEP)
        for tid in TARGET_TENANT_IDS:
            row = await session.get(Tenant, tid)
            if row and tid != KEEP_TENANT_ID:
                if row not in tenants_to_delete:
                    tenants_to_delete.append(row)

        if not tenants_to_delete:
            print("ℹ️  No se encontraron tenants de ipachoteayuda para eliminar.")
            print("   (Los id legacy tenant_9ef2a8bdd6b7 / tenant_7099f777c4d8 no existen.)")
            return

        print("Se eliminarán los siguientes tenants (con sus datos):")
        for t in tenants_to_delete:
            counts = await _count_dependents(session, t.tenant_id)
            print(f"  • {t.tenant_id} (nombre={t.name!r}, domain={t.domain!r})")
            for k, v in counts.items():
                print(f"      {k}: {v}")

        # 2) Ejecutar borrado (misma sesión)
        for t in tenants_to_delete:
            desp = await _delete_dependents(session, t.tenant_id)
            await session.delete(await session.get(Tenant, t.tenant_id))
            total = sum(desp.values())
            print(f"Eliminado {t.tenant_id} + {total} filas dependientes ({desp})")
        await session.commit()

        print("OK: tenants de ipachoteayuda eliminados.")


if __name__ == "__main__":
    asyncio.run(main())