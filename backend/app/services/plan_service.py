"""
Plan Service - CRUD del catálogo de planes de suscripción (ver estrategia de
facturación, docs/dev/DECISIONS.md).
"""

import uuid
from typing import Dict, List, Optional

from sqlalchemy import func, select

from app.db.database import AsyncSessionLocal
from app.db.models import Module as ModuleModel
from app.db.models import Plan as PlanModel
from app.db.models import PlanModule as PlanModuleModel
from app.db.models import Tenant as TenantModel
from app.models.plan import Plan, PlanCreate, PlanUpdate


def _to_plan(row: PlanModel, included_module_keys: List[str]) -> Plan:
    return Plan(
        plan_id=row.plan_id,
        name=row.name,
        description=row.description,
        amount=float(row.amount),
        periodicity=row.periodicity,
        included_module_keys=included_module_keys,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


async def _validate_module_keys(session, module_keys: List[str]) -> None:
    if not module_keys:
        return
    result = await session.execute(
        select(ModuleModel.module_key).where(ModuleModel.module_key.in_(module_keys))
    )
    existing = {row[0] for row in result.all()}
    missing = set(module_keys) - existing
    if missing:
        raise ValueError(f"Módulo(s) inexistente(s) en el catálogo: {', '.join(sorted(missing))}")


async def _get_included_module_keys(session, plan_id: str) -> List[str]:
    result = await session.execute(
        select(PlanModuleModel.module_key).where(PlanModuleModel.plan_id == plan_id)
    )
    return [row[0] for row in result.all()]


class PlanService:
    async def create_plan(self, data: PlanCreate) -> Plan:
        plan_id = f"plan_{uuid.uuid4().hex[:12]}"
        async with AsyncSessionLocal() as session:
            await _validate_module_keys(session, data.included_module_keys)
            row = PlanModel(
                plan_id=plan_id,
                name=data.name,
                description=data.description,
                amount=data.amount,
                periodicity=data.periodicity.value,
            )
            session.add(row)
            for module_key in data.included_module_keys:
                session.add(PlanModuleModel(plan_id=plan_id, module_key=module_key))
            await session.commit()
            await session.refresh(row)
            return _to_plan(row, data.included_module_keys)

    async def get_plan(self, plan_id: str) -> Optional[Plan]:
        async with AsyncSessionLocal() as session:
            row = await session.get(PlanModel, plan_id)
            if not row:
                return None
            included_module_keys = await _get_included_module_keys(session, plan_id)
            return _to_plan(row, included_module_keys)

    async def list_plans(self) -> List[Plan]:
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(PlanModel).order_by(PlanModel.created_at.asc()))
            rows = result.scalars().all()

            modules_result = await session.execute(select(PlanModuleModel))
            keys_by_plan: Dict[str, List[str]] = {}
            for pm in modules_result.scalars().all():
                keys_by_plan.setdefault(pm.plan_id, []).append(pm.module_key)

            return [_to_plan(r, keys_by_plan.get(r.plan_id, [])) for r in rows]

    async def update_plan(self, plan_id: str, data: PlanUpdate) -> Optional[Plan]:
        update_dict = data.model_dump(exclude_unset=True)
        included_module_keys = update_dict.pop("included_module_keys", None)
        if "periodicity" in update_dict and update_dict["periodicity"] is not None:
            periodicity_value = update_dict["periodicity"]
            update_dict["periodicity"] = periodicity_value.value if hasattr(periodicity_value, "value") else periodicity_value

        async with AsyncSessionLocal() as session:
            row = await session.get(PlanModel, plan_id)
            if not row:
                return None

            if included_module_keys is not None:
                await _validate_module_keys(session, included_module_keys)

            for k, v in update_dict.items():
                if v is not None:
                    setattr(row, k, v)

            if included_module_keys is not None:
                existing = await session.execute(
                    select(PlanModuleModel).where(PlanModuleModel.plan_id == plan_id)
                )
                for pm in existing.scalars().all():
                    await session.delete(pm)
                for module_key in included_module_keys:
                    session.add(PlanModuleModel(plan_id=plan_id, module_key=module_key))

            await session.commit()
            await session.refresh(row)
            final_module_keys = (
                included_module_keys
                if included_module_keys is not None
                else await _get_included_module_keys(session, plan_id)
            )
            return _to_plan(row, final_module_keys)

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
