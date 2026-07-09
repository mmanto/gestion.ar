"""
Plan Service - CRUD del catálogo de planes de suscripción (ver estrategia de
facturación, docs/dev/DECISIONS.md).
"""

import uuid
from typing import Dict, List, Optional

from sqlalchemy import func, select

from app.db.database import AsyncSessionLocal
from app.db.models import Plan as PlanModel
from app.db.models import Tenant as TenantModel
from app.models.plan import Plan, PlanCreate, PlanUpdate


def _to_plan(row: PlanModel) -> Plan:
    return Plan(
        plan_id=row.plan_id,
        name=row.name,
        description=row.description,
        amount=float(row.amount),
        periodicity=row.periodicity,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


class PlanService:
    async def create_plan(self, data: PlanCreate) -> Plan:
        plan_id = f"plan_{uuid.uuid4().hex[:12]}"
        async with AsyncSessionLocal() as session:
            row = PlanModel(
                plan_id=plan_id,
                name=data.name,
                description=data.description,
                amount=data.amount,
                periodicity=data.periodicity.value,
            )
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return _to_plan(row)

    async def get_plan(self, plan_id: str) -> Optional[Plan]:
        async with AsyncSessionLocal() as session:
            row = await session.get(PlanModel, plan_id)
            return _to_plan(row) if row else None

    async def list_plans(self) -> List[Plan]:
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(PlanModel).order_by(PlanModel.created_at.asc()))
            rows = result.scalars().all()
            return [_to_plan(r) for r in rows]

    async def update_plan(self, plan_id: str, data: PlanUpdate) -> Optional[Plan]:
        update_dict = data.model_dump(exclude_unset=True)
        if "periodicity" in update_dict and update_dict["periodicity"] is not None:
            periodicity_value = update_dict["periodicity"]
            update_dict["periodicity"] = periodicity_value.value if hasattr(periodicity_value, "value") else periodicity_value

        async with AsyncSessionLocal() as session:
            row = await session.get(PlanModel, plan_id)
            if not row:
                return None
            for k, v in update_dict.items():
                if v is not None:
                    setattr(row, k, v)
            await session.commit()
            await session.refresh(row)
            return _to_plan(row)

    async def delete_plan(self, plan_id: str) -> bool:
        """Elimina un plan. Falla (devuelve False) si hay tenants suscriptos,
        ya que todo tenant debe tener un plan asignado."""
        async with AsyncSessionLocal() as session:
            row = await session.get(PlanModel, plan_id)
            if not row:
                return False

            in_use = (await session.execute(
                select(func.count()).select_from(TenantModel).where(TenantModel.plan_id == plan_id)
            )).scalar_one()
            if in_use > 0:
                return False

            await session.delete(row)
            await session.commit()
            return True


_plan_service: Optional[PlanService] = None


def get_plan_service() -> PlanService:
    global _plan_service
    if _plan_service is None:
        _plan_service = PlanService()
    return _plan_service
