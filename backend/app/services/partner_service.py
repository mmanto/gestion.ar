"""
Partner Service - rol `partner`: construir y administrar tenants derivados de
un tenant base (ver ADR-041 en docs/dev/DECISIONS.md).

Un partner es un usuario con `role='partner'` y `users.tenant_id` apuntando a
su **tenant base**. Su alcance son ese tenant y los tenants derivados de él
(`tenants.parent_tenant_id == base`), nunca los tenants de otros:

- El alta de un derivado **clona** el agente y los módulos ya configurados del
  base, sin canales ni datos operativos, y **sin** la config de IA
  (`tenant_llm_configs`): el tenant nuevo carga su propia key en Ajustes ›
  Proveedor de IA. Es una foto al momento del alta: los cambios posteriores en
  el base no se propagan.
- Sobre los agentes sólo puede prender/apagar módulos ya otorgados
  (`granted=True`): otorgar y revocar es de administración general.
- No crea agentes ni edita su configuración técnica.
"""

import copy
import uuid
from typing import Dict, List, Optional, Sequence

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from app.db.database import AsyncSessionLocal
from app.db.models import Bot as BotModel
from app.db.models import BotModule as BotModuleModel
from app.db.models import Channel as ChannelModel
from app.db.models import Client as ClientModel
from app.db.models import Conversation as ConversationModel
from app.db.models import PushSubscription as PushSubscriptionModel
from app.db.models import Tenant as TenantModel
from app.db.models import TenantModule as TenantModuleModel
from app.db.models import User as UserModel
from app.models.tenant import (
    BotModuleOut,
    PartnerTenantCreate,
    PartnerTenantUpdate,
    Tenant,
    TenantUpdate,
)
from app.services.bot_service import get_bot_service
from app.services.module_service import get_module_service
from app.services.tenant_service import get_tenant_service, to_tenant


#: Datos operativos que bloquean el borrado de un tenant derivado: el partner
#: los limpia primero (nunca en cascada). Los agentes clonados *sí* se borran
#: con el tenant — son parte de la copia, no datos generados.
BUSINESS_DATA_DEPENDENTS = (
    ChannelModel,
    ClientModel,
    ConversationModel,
    PushSubscriptionModel,
    UserModel,
)


def build_cloned_rows(
    base: TenantModel,
    bots: Sequence[BotModel],
    bot_modules_by_bot: Dict[str, Sequence[BotModuleModel]],
    tenant_modules: Sequence[TenantModuleModel],
    *,
    new_tenant_id: str,
    name: str,
    domain: Optional[str],
    branding: Dict,
) -> tuple[TenantModel, List[BotModel], List[BotModuleModel], List[TenantModuleModel]]:
    """Arma las filas del tenant derivado a partir del base (sin persistir).

    Función pura para poder testear las reglas del clon sin base de datos:

    - El tenant nuevo hereda estado, plan y `settings` (deep copy: los flags de
      runtime son parte de la configuración, no datos operativos) y el
      branding del base mezclado con el del alta (gana el del alta).
    - Cada agente se copia entero **menos** canales y contadores: nace sin
      `channel_ids`, con los contadores en cero y `metadata` vacía. La config
      técnica (`config`) va deep-copiada porque es la plantilla que el partner
      replica; no se toca después.
    - Los módulos del agente y del tenant se copian con su `granted`/`enabled`
      tal como estaban: el partner no otorga ni revoca.
    - Nunca se copian `api_key_hash`, canales, clientes, conversaciones ni
      `tenant_llm_configs`.
    """
    tenant_row = TenantModel(
        tenant_id=new_tenant_id,
        name=name,
        domain=domain,
        status=base.status,
        plan_id=base.plan_id,
        settings=copy.deepcopy(base.settings or {}),
        branding={**(base.branding or {}), **branding},
        parent_tenant_id=base.tenant_id,
        api_key_hash=None,
    )

    bot_rows: List[BotModel] = []
    bot_module_rows: List[BotModuleModel] = []
    for bot in bots:
        new_bot_id = f"bot_{uuid.uuid4().hex[:12]}"
        bot_rows.append(BotModel(
            bot_id=new_bot_id,
            tenant_id=new_tenant_id,
            owner_id=bot.owner_id,
            name=bot.name,
            description=bot.description,
            business_type=bot.business_type,
            status=bot.status,
            config=copy.deepcopy(bot.config or {}),
            channel_ids=[],
            metadata_={},
            total_clients=0,
            total_conversations=0,
            total_messages=0,
        ))
        for module in bot_modules_by_bot.get(bot.bot_id, []):
            bot_module_rows.append(BotModuleModel(
                bot_id=new_bot_id,
                module_key=module.module_key,
                granted=module.granted,
                enabled=module.enabled,
                granted_by=module.granted_by,
                granted_at=module.granted_at,
            ))

    tenant_module_rows = [
        TenantModuleModel(
            tenant_id=new_tenant_id,
            module_key=module.module_key,
            enabled=module.enabled,
            granted_by=module.granted_by,
            granted_at=module.granted_at,
        )
        for module in tenant_modules
    ]

    return tenant_row, bot_rows, bot_module_rows, tenant_module_rows


class PartnerService:
    """Alcance y operaciones del rol partner. Única fuente del scoping
    base ↔ derivados: ningún endpoint decide por su cuenta qué tenant puede
    tocar un partner."""

    @staticmethod
    def base_tenant_id(user) -> str:
        """Tenant base del partner (`users.tenant_id`)."""
        if not getattr(user, "tenant_id", None):
            raise PermissionError("El usuario partner no tiene tenant base asignado")
        return user.tenant_id

    @staticmethod
    def is_managed(base_tenant_id: str, tenant) -> bool:
        """¿Este tenant entra en el alcance del partner? El base sí (es su
        tenant) y sus derivados directos también."""
        return tenant.tenant_id == base_tenant_id or tenant.parent_tenant_id == base_tenant_id

    async def list_tenants(self, base_tenant_id: str, skip: int = 0, limit: int = 20) -> Dict:
        """Tenant base + derivados, del más nuevo al más viejo."""
        filters = (
            (TenantModel.tenant_id == base_tenant_id)
            | (TenantModel.parent_tenant_id == base_tenant_id)
        )
        async with AsyncSessionLocal() as session:
            total = (await session.execute(
                select(func.count()).select_from(TenantModel).where(filters)
            )).scalar_one()
            result = await session.execute(
                select(TenantModel).where(filters)
                .order_by(TenantModel.created_at.desc())
                .offset(skip).limit(limit)
            )
            rows = result.scalars().all()

        return {
            "tenants": [to_tenant(r) for r in rows],
            "total": total,
            "page": (skip // limit) + 1 if limit > 0 else 1,
            "pages": (total + limit - 1) // limit if limit > 0 else 0,
            "limit": limit,
        }

    async def get_managed_tenant(self, base_tenant_id: str, tenant_id: str) -> Optional[Tenant]:
        """El tenant si está en el alcance del partner; `None` si no existe o
        es de otro (el caller responde 404 — no se filtra qué tenants hay)."""
        async with AsyncSessionLocal() as session:
            row = await session.get(TenantModel, tenant_id)
            if not row or not self.is_managed(base_tenant_id, row):
                return None
            return to_tenant(row)

    async def provision_tenant(self, base_tenant_id: str, data: PartnerTenantCreate) -> Tenant:
        """Da de alta un tenant derivado clonando agente y módulos del base.

        Raises:
            LookupError: el tenant base no existe.
            PermissionError: el tenant base está suspendido.
            ValueError: ya existe un tenant con ese dominio.
        """
        new_tenant_id = f"tenant_{uuid.uuid4().hex[:12]}"
        async with AsyncSessionLocal() as session:
            base = await session.get(TenantModel, base_tenant_id)
            if not base:
                raise LookupError(base_tenant_id)
            if base.status == "suspended":
                raise PermissionError("El tenant base está suspendido")

            bots = (await session.execute(
                select(BotModel).where(BotModel.tenant_id == base_tenant_id)
            )).scalars().all()
            bot_ids = [bot.bot_id for bot in bots]
            bot_modules_by_bot: Dict[str, List[BotModuleModel]] = {bot_id: [] for bot_id in bot_ids}
            if bot_ids:
                bot_modules = (await session.execute(
                    select(BotModuleModel).where(BotModuleModel.bot_id.in_(bot_ids))
                )).scalars().all()
                for module in bot_modules:
                    bot_modules_by_bot[module.bot_id].append(module)
            tenant_modules = (await session.execute(
                select(TenantModuleModel).where(TenantModuleModel.tenant_id == base_tenant_id)
            )).scalars().all()

            tenant_row, bot_rows, bot_module_rows, tenant_module_rows = build_cloned_rows(
                base,
                bots,
                bot_modules_by_bot,
                tenant_modules,
                new_tenant_id=new_tenant_id,
                name=data.name,
                domain=data.domain,
                branding=data.branding or {},
            )
            try:
                # Los FKs son auto-referenciales en `tenants` (parent_tenant_id),
                # así que el flush no puede ordenar tenant → agentes → módulos
                # por sí solo: se hace explícito en tres pasos.
                session.add(tenant_row)
                await session.flush()
                session.add_all(bot_rows)
                await session.flush()
                session.add_all([*bot_module_rows, *tenant_module_rows])
                await session.commit()
            except IntegrityError as e:
                await session.rollback()
                if getattr(e.orig, "sqlstate", None) == "23505":
                    raise ValueError("Ya existe un tenant con ese dominio")
                raise
            await session.refresh(tenant_row)
            return to_tenant(tenant_row)

    async def update_managed_tenant(
        self, base_tenant_id: str, tenant_id: str, data: PartnerTenantUpdate
    ) -> Optional[Tenant]:
        """Edita un tenant del alcance. El base no se suspende desde acá.

        Raises:
            LookupError: el tenant no está en el alcance del partner.
            ValueError: se intenta cambiar el estado del tenant base.
        """
        tenant = await self.get_managed_tenant(base_tenant_id, tenant_id)
        if not tenant:
            raise LookupError(tenant_id)
        if tenant_id == base_tenant_id and data.status is not None:
            raise ValueError("El tenant base no se puede suspender desde el panel de partner")
        return await get_tenant_service().update_tenant(
            tenant_id, TenantUpdate(**data.model_dump(exclude_unset=True))
        )

    async def delete_managed_child(self, base_tenant_id: str, tenant_id: str) -> bool:
        """Elimina un tenant derivado (nunca el base). `False` = tiene datos.

        A diferencia del borrado de administración general
        (`TenantService.delete_tenant`, que exige un tenant vacío), acá los
        **agentes clonados** se borran junto con el tenant: son la copia que el
        partner hizo del base, no datos de negocio. Los datos operativos
        (`BUSINESS_DATA_DEPENDENTS`: usuarios, canales, clientes, conversaciones
        y push subscriptions) siguen bloqueando el borrado y se limpian a mano.

        Raises:
            LookupError: el tenant no está en el alcance del partner.
            ValueError: se intenta borrar el tenant base.
        """
        tenant = await self.get_managed_tenant(base_tenant_id, tenant_id)
        if not tenant:
            raise LookupError(tenant_id)
        if tenant_id == base_tenant_id:
            raise ValueError("El tenant base no se puede eliminar desde el panel de partner")

        async with AsyncSessionLocal() as session:
            row = await session.get(TenantModel, tenant_id)
            if not row:
                return False

            for model in BUSINESS_DATA_DEPENDENTS:
                count = (await session.execute(
                    select(func.count()).select_from(model).where(model.tenant_id == tenant_id)
                )).scalar_one()
                if count > 0:
                    return False

            child_count = (await session.execute(
                select(func.count()).select_from(TenantModel)
                .where(TenantModel.parent_tenant_id == tenant_id)
            )).scalar_one()
            if child_count > 0:
                return False

            # `bot_modules` cae por FK ON DELETE CASCADE; `tenant_modules` y
            # `tenant_llm_configs` también al borrar el tenant.
            await session.execute(delete(BotModel).where(BotModel.tenant_id == tenant_id))
            await session.delete(row)
            try:
                await session.commit()
            except IntegrityError:
                await session.rollback()
                return False
            return True

    async def list_bots(self, base_tenant_id: str, tenant_id: str, skip: int, limit: int) -> Dict:
        """Agentes de un tenant del alcance (resumen read-only, mismo shape que
        `/api/tenant/bots`)."""
        if not await self.get_managed_tenant(base_tenant_id, tenant_id):
            raise LookupError(tenant_id)
        return await get_bot_service().get_bots_by_tenant(tenant_id, skip=skip, limit=limit)

    async def _verify_bot(self, base_tenant_id: str, tenant_id: str, bot_id: str):
        if not await self.get_managed_tenant(base_tenant_id, tenant_id):
            raise LookupError(tenant_id)
        bot = await get_bot_service().get_bot(bot_id)
        if not bot or bot.tenant_id != tenant_id:
            raise LookupError(bot_id)
        return bot

    async def get_bot_modules(
        self, base_tenant_id: str, tenant_id: str, bot_id: str
    ) -> List[BotModuleOut]:
        await self._verify_bot(base_tenant_id, tenant_id, bot_id)
        return await get_module_service().get_bot_modules(bot_id)

    async def set_bot_module_enabled(
        self, base_tenant_id: str, tenant_id: str, bot_id: str, module_key: str, enabled: bool
    ) -> BotModuleOut:
        """Prende/apaga un módulo **ya otorgado** del agente.

        Raises:
            LookupError: tenant o agente fuera del alcance.
            PermissionError: el módulo no está otorgado a este agente (el
                partner no otorga ni revoca — eso es de administración general).
        """
        await self._verify_bot(base_tenant_id, tenant_id, bot_id)
        modules = await get_module_service().get_bot_modules(bot_id)
        module = next((m for m in modules if m.module_key == module_key), None)
        if module is None or not module.granted:
            raise PermissionError("El módulo no está otorgado a este agente")
        return await get_module_service().set_enabled(bot_id, module_key, enabled)


_partner_service: Optional[PartnerService] = None


def get_partner_service() -> PartnerService:
    global _partner_service
    if _partner_service is None:
        _partner_service = PartnerService()
    return _partner_service
