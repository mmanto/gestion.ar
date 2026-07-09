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
from app.db.models import BotModule as BotModuleModel
from app.db.models import Module as ModuleModel
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

    async def get_bot_modules(self, bot_id: str) -> List[BotModuleOut]:
        """Todos los módulos del catálogo, con su estado granted/enabled para
        este bot (aunque nunca se haya otorgado — enabled/granted=False)."""
        async with AsyncSessionLocal() as session:
            modules_result = await session.execute(select(ModuleModel))
            modules = modules_result.scalars().all()

            grants_result = await session.execute(
                select(BotModuleModel).where(BotModuleModel.bot_id == bot_id)
            )
            grants_by_key = {g.module_key: g for g in grants_result.scalars().all()}

        items = []
        for module in modules:
            grant = grants_by_key.get(module.module_key)
            items.append(BotModuleOut(
                bot_id=bot_id,
                module_key=module.module_key,
                granted=grant.granted if grant else False,
                enabled=grant.enabled if grant else False,
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
                granted=row.granted, enabled=row.enabled,
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
        """Habilita/deshabilita un módulo ya otorgado (admin del tenant).

        Raises:
            ValueError: si se intenta habilitar un módulo no otorgado.
            LookupError: si el módulo no existe en el catálogo o no fue
                otorgado nunca a este bot.
        """
        async with AsyncSessionLocal() as session:
            row = await session.get(BotModuleModel, (bot_id, module_key))
            if row is None or not row.granted:
                if enabled:
                    raise ValueError(f"El módulo '{module_key}' no fue otorgado a este bot")
                if row is None:
                    raise LookupError(f"El módulo '{module_key}' no fue otorgado a este bot")

            row.enabled = enabled
            await session.commit()
            await session.refresh(row)
            return BotModuleOut(
                bot_id=row.bot_id, module_key=row.module_key,
                granted=row.granted, enabled=row.enabled,
            )


_module_service: Optional[ModuleService] = None


def get_module_service() -> ModuleService:
    global _module_service
    if _module_service is None:
        _module_service = ModuleService()
    return _module_service
