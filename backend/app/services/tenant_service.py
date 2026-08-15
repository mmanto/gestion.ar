"""
Tenant Service - CRUD de tenants y usuarios de administración general
(ver estrategia multi-tenant, docs/dev/DECISIONS.md).
"""

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


def _to_tenant(row: TenantModel) -> Tenant:
    return Tenant(
        tenant_id=row.tenant_id,
        name=row.name,
        domain=row.domain,
        status=row.status,
        branding=row.branding or {},
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
