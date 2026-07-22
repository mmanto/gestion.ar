"""
Module Service - Catálogo de módulos y otorgamiento/habilitación por bot
(capa de entitlement — ver estrategia multi-tenant, docs/dev/DECISIONS.md).

`granted` lo escribe únicamente administración general (super_admin).
`enabled` lo escribe el admin del tenant, y sólo si `granted=True`.
"""

from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import select

from app.db.database import AsyncSessionLocal
from app.db.models import Bot as BotModel
from app.db.models import BotModule as BotModuleModel
from app.db.models import Module as ModuleModel
from app.db.models import PlanModule as PlanModuleModel
from app.db.models import Tenant as TenantModel
from app.models.tenant import BotModuleOut, ModuleOut


def _to_module(row: ModuleModel) -> ModuleOut:
    return ModuleOut(module_key=row.module_key, name=row.name, description=row.description)


class ModuleService:
    async def list_modules(self) -> List[ModuleOut]:
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(ModuleModel))
            return [_to_module(r) for r in result.scalars().all()]

    async def is_enabled(self, bot_id: str, module_key: str) -> bool:
        """Chequeo liviano para gatear funcionalidad real (ej. reserva de
        turnos). `enabled=True` implica `granted=True` (CHECK
        ck_bot_modules_enabled_requires_granted), así que alcanza con leer
        `enabled`."""
        async with AsyncSessionLocal() as session:
            row = await session.get(BotModuleModel, (bot_id, module_key))
            return bool(row and row.enabled)

    async def is_available(self, bot_id: str, module_key: str) -> bool:
        """True si el módulo puede habilitarse para este bot: otorgado
        manualmente (BotModule.granted) O incluido en el plan del tenant
        (ver ADR-008, docs/dev/DECISIONS.md). No implica `enabled` — solo
        que el tenant-admin puede prender el toggle."""
        async with AsyncSessionLocal() as session:
            return await self._is_available(session, bot_id, module_key)

    async def _is_available(self, session, bot_id: str, module_key: str) -> bool:
        row = await session.get(BotModuleModel, (bot_id, module_key))
        if row and row.granted:
            return True

        bot = await session.get(BotModel, bot_id)
        if not bot or not bot.tenant_id:
            return False
        tenant = await session.get(TenantModel, bot.tenant_id)
        if not tenant:
            return False
        plan_module = await session.get(PlanModuleModel, (tenant.plan_id, module_key))
        return plan_module is not None

    async def get_bot_modules(self, bot_id: str) -> List[BotModuleOut]:
        """Todos los módulos del catálogo, con su estado granted/enabled/
        available para este bot (aunque nunca se haya otorgado — en ese
        caso `available` puede seguir siendo True si el plan lo incluye)."""
        async with AsyncSessionLocal() as session:
            modules_result = await session.execute(select(ModuleModel))
            modules = modules_result.scalars().all()

            grants_result = await session.execute(
                select(BotModuleModel).where(BotModuleModel.bot_id == bot_id)
            )
            grants_by_key = {g.module_key: g for g in grants_result.scalars().all()}

            # Set de módulos incluidos por el plan del tenant — una sola
            # query para todos los módulos del catálogo, no una por módulo.
            plan_included_keys: set = set()
            bot = await session.get(BotModel, bot_id)
            if bot and bot.tenant_id:
                tenant = await session.get(TenantModel, bot.tenant_id)
                if tenant:
                    plan_modules_result = await session.execute(
                        select(PlanModuleModel.module_key).where(PlanModuleModel.plan_id == tenant.plan_id)
                    )
                    plan_included_keys = {row[0] for row in plan_modules_result.all()}

        items = []
        for module in modules:
            grant = grants_by_key.get(module.module_key)
            granted = grant.granted if grant else False
            items.append(BotModuleOut(
                bot_id=bot_id,
                module_key=module.module_key,
                granted=granted,
                enabled=grant.enabled if grant else False,
                available=granted or module.module_key in plan_included_keys,
                module_name=module.name,
                module_description=module.description,
            ))
        return items

    async def grant_module(self, bot_id: str, module_key: str, granted_by: str) -> BotModuleOut:
        async with AsyncSessionLocal() as session:
            row = await session.get(BotModuleModel, (bot_id, module_key))
            if row is None:
                row = BotModuleModel(
                    bot_id=bot_id,
                    module_key=module_key,
                    granted=True,
                    granted_by=granted_by,
                    granted_at=datetime.now(timezone.utc),
                )
                session.add(row)
            else:
                row.granted = True
                row.granted_by = granted_by
                row.granted_at = datetime.now(timezone.utc)
            await session.commit()
            await session.refresh(row)
            return BotModuleOut(
                bot_id=row.bot_id, module_key=row.module_key,
                granted=row.granted, enabled=row.enabled, available=row.granted,
            )

    async def revoke_module(self, bot_id: str, module_key: str) -> bool:
        """Revoca el otorgamiento — también deshabilita (enabled requiere
        granted, ver CHECK ck_bot_modules_enabled_requires_granted)."""
        async with AsyncSessionLocal() as session:
            row = await session.get(BotModuleModel, (bot_id, module_key))
            if row is None:
                return False
            row.granted = False
            row.enabled = False
            await session.commit()
            return True

    async def set_enabled(self, bot_id: str, module_key: str, enabled: bool) -> BotModuleOut:
        """Habilita/deshabilita un módulo disponible para este bot (admin
        del tenant). "Disponible" = otorgado O incluido en el plan (ver
        ADR-008) — si el módulo viene solo del plan (sin BotModule previo),
        el grant se materializa acá (`granted=True`, `granted_by=NULL` como
        marca de que no fue un grant_module manual de super_admin), porque
        el CHECK ck_bot_modules_enabled_requires_granted exige `granted` a
        nivel de fila para poder poner `enabled=True`.

        Raises:
            ValueError: si se intenta habilitar un módulo no disponible.
            LookupError: si se intenta deshabilitar un módulo que nunca
                tuvo una fila BotModule para este bot.
        """
        async with AsyncSessionLocal() as session:
            row = await session.get(BotModuleModel, (bot_id, module_key))

            if enabled:
                if not (row and row.granted) and not await self._is_available(session, bot_id, module_key):
                    raise ValueError(f"El módulo '{module_key}' no está disponible para este bot")
                if row is None:
                    row = BotModuleModel(bot_id=bot_id, module_key=module_key, granted=True)
                    session.add(row)
                elif not row.granted:
                    row.granted = True
            elif row is None:
                raise LookupError(f"El módulo '{module_key}' no fue otorgado a este bot")

            row.enabled = enabled
            await session.commit()
            await session.refresh(row)
            return BotModuleOut(
                bot_id=row.bot_id, module_key=row.module_key,
                granted=row.granted, enabled=row.enabled, available=row.granted,
            )


_module_service: Optional[ModuleService] = None


def get_module_service() -> ModuleService:
    global _module_service
    if _module_service is None:
        _module_service = ModuleService()
    return _module_service
