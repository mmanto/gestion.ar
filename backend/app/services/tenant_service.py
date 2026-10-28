"""
Tenant Service - CRUD de tenants y usuarios de administración general
(ver estrategia multi-tenant, docs/dev/DECISIONS.md).
"""

import secrets
import uuid
from typing import Dict, Optional

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.db.database import AsyncSessionLocal
from app.db.models import (
    Bot as BotModel,
    Channel as ChannelModel,
    Client as ClientModel,
    Conversation as ConversationModel,
    PushSubscription as PushSubscriptionModel,
    Tenant as TenantModel,
    User as UserModel,
)
from app.models.tenant import Tenant, TenantCreate, TenantStatus, TenantUpdate
from app.services.device_service import sha256_hex

# Sufijo reservado por RFC 6761: cualquier *.localhost resuelve a loopback, así
# que en dev local un tenant con dominio propio se abre en <dominio>.localhost
# (ej. http://pachoteayuda.ar.localhost/) sin tocar /etc/hosts ni duplicar la
# fila del tenant con un dominio de prueba. En prod no está alcanzable: Traefik
# no tiene ningún router cuyo Host termine en .localhost.
LOCALHOST_SUFFIX = ".localhost"


def _to_tenant(row: TenantModel) -> Tenant:
    return Tenant(
        tenant_id=row.tenant_id,
        name=row.name,
        domain=row.domain,
        status=row.status,
        branding=row.branding or {},
        settings=row.settings or {},
        plan_id=row.plan_id,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


class TenantService:
    async def create_tenant(self, data: TenantCreate) -> Tenant:
        tenant_id = f"tenant_{uuid.uuid4().hex[:12]}"
        async with AsyncSessionLocal() as session:
            row = TenantModel(
                tenant_id=tenant_id,
                name=data.name,
                domain=data.domain,
                status=data.status.value,
                branding=data.branding or {},
                plan_id=data.plan_id,
            )
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return _to_tenant(row)

    async def get_tenant(self, tenant_id: str) -> Optional[Tenant]:
        async with AsyncSessionLocal() as session:
            row = await session.get(TenantModel, tenant_id)
            return _to_tenant(row) if row else None

    async def get_tenant_by_domain(self, domain: str) -> Optional[Tenant]:
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(TenantModel).where(TenantModel.domain == domain))
            row = result.scalars().first()
            return _to_tenant(row) if row else None

    async def get_tenant_by_host(self, host: str) -> Optional[Tenant]:
        """Tenant que sirve `host` (incluye el alias de dev `<dominio>.localhost`).

        Es el único lugar que sabe cómo un Host se traduce a tenant: lo usan
        `GET /api/public/tenants/current` (la SPA resuelve su organización) y la
        config de passkeys (el RP ID de WebAuthn tiene que ser el dominio que de
        verdad sirve la página).
        """
        host = host.split(":")[0].strip().lower()
        if not host:
            return None
        tenant = await self.get_tenant_by_domain(host)
        if not tenant and host.endswith(LOCALHOST_SUFFIX):
            alias = host[: -len(LOCALHOST_SUFFIX)]
            if alias:
                tenant = await self.get_tenant_by_domain(alias)
        return tenant

    async def list_tenants(self, skip: int = 0, limit: int = 20) -> Dict:
        async with AsyncSessionLocal() as session:
            total = (await session.execute(select(func.count()).select_from(TenantModel))).scalar_one()
            result = await session.execute(
                select(TenantModel).order_by(TenantModel.created_at.desc()).offset(skip).limit(limit)
            )
            rows = result.scalars().all()

        return {
            "tenants": [_to_tenant(r) for r in rows],
            "total": total,
            "page": (skip // limit) + 1 if limit > 0 else 1,
            "pages": (total + limit - 1) // limit if limit > 0 else 0,
            "limit": limit,
        }

    async def update_tenant(self, tenant_id: str, data: TenantUpdate) -> Optional[Tenant]:
        update_dict = data.model_dump(exclude_unset=True)
        if "status" in update_dict and update_dict["status"] is not None:
            status_value = update_dict["status"]
            update_dict["status"] = status_value.value if hasattr(status_value, "value") else status_value

        async with AsyncSessionLocal() as session:
            row = await session.get(TenantModel, tenant_id)
            if not row:
                return None
            for k, v in update_dict.items():
                if v is not None:
                    setattr(row, k, v)
            await session.commit()
            await session.refresh(row)
            return _to_tenant(row)

    # ── API key del tenant (canal de voz / clientes server-side) ──────────
    #
    # Mismo patrón que devbout-appointments (docs/dev/API.md §1.2): la key se
    # muestra en claro una sola vez y en la BD queda solo su SHA-256. No se
    # deriva del tenant_id (que es público): es un secreto aleatorio.

    @staticmethod
    def _generate_key() -> tuple[str, str]:
        key = "tk_live_" + secrets.token_urlsafe(32)
        return key, sha256_hex(key)

    async def issue_api_key(self, tenant_id: str, rotate: bool = False) -> Optional[str]:
        """Emite una key nueva y devuelve la key en claro (única vez).

        - `rotate=False` y el tenant ya tiene key → no toca nada y devuelve None.
        - `rotate=True` reemplaza la anterior (la vieja deja de resolver al
          instante, sin caché).
        """
        key, key_hash = self._generate_key()
        async with AsyncSessionLocal() as session:
            row = await session.get(TenantModel, tenant_id)
            if not row:
                raise LookupError(tenant_id)
            if row.api_key_hash and not rotate:
                return None
            row.api_key_hash = key_hash
            await session.commit()
            return key

    async def has_api_key(self, tenant_id: str) -> bool:
        async with AsyncSessionLocal() as session:
            row = await session.get(TenantModel, tenant_id)
            return bool(row and row.api_key_hash)

    async def clear_api_key(self, tenant_id: str) -> bool:
        """Revoca la key del tenant (los clientes pasan a 401)."""
        async with AsyncSessionLocal() as session:
            row = await session.get(TenantModel, tenant_id)
            if not row:
                return False
            row.api_key_hash = None
            await session.commit()
            return True

    async def get_tenant_by_api_key(self, key: str) -> Optional[Tenant]:
        """Resuelve el tenant por el hash de la key presentada.

        Lookup indexado por `api_key_hash`; no se compara la key en claro en
        Python ni se loguea. Un tenant suspendido no resuelve (el caller
        devuelve 403 con el mismo criterio que la SPA).
        """
        key = (key or "").strip()
        if not key.startswith("tk_live_"):
            return None
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(TenantModel).where(TenantModel.api_key_hash == sha256_hex(key))
            )
            row = result.scalars().first()
            if not row or row.status != TenantStatus.ACTIVE.value:
                return None
            return _to_tenant(row)

    async def delete_tenant(self, tenant_id: str) -> bool:
        """Elimina un tenant. Falla (devuelve False) si tiene datos asociados
        que dependen de él (bots, usuarios, canales, clientes o
        conversaciones) — esos deben eliminarse primero, igual que
        delete_plan/delete_user: nunca borrar en cascada datos de negocio."""
        dependents = {
            "bots": BotModel,
            "channels": ChannelModel,
            "clients": ClientModel,
            "conversations": ConversationModel,
            "push_subscriptions": PushSubscriptionModel,
            "users": UserModel,
        }
        async with AsyncSessionLocal() as session:
            row = await session.get(TenantModel, tenant_id)
            if not row:
                return False

            for label, model in dependents.items():
                count = (await session.execute(
                    select(func.count()).select_from(model).where(model.tenant_id == tenant_id)
                )).scalar_one()
                if count > 0:
                    return False

            try:
                await session.delete(row)
                await session.commit()
            except IntegrityError:
                await session.rollback()
                return False
            return True


_tenant_service: Optional[TenantService] = None


def get_tenant_service() -> TenantService:
    global _tenant_service
    if _tenant_service is None:
        _tenant_service = TenantService()
    return _tenant_service
