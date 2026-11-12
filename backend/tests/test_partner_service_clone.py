"""
Tests unitarios del clon de tenant derivado y del alcance del rol partner.

Sin base de datos: `build_cloned_rows` es una función pura sobre filas
(SimpleNamespace) y las guardas de alcance de `PartnerService` sólo leen
atributos. Ver ADR-041 (docs/dev/DECISIONS.md).
"""

from types import SimpleNamespace

import pytest

import app.services.partner_service as ps
from app.services.partner_service import PartnerService, build_cloned_rows


def _base_tenant():
    return SimpleNamespace(
        tenant_id="tenant_base",
        status="active",
        plan_id="pro",
        settings={"free_signup": True, "nested": {"flag": True}},
        branding={"primary_color": "#111111", "tagline": "tagline del base"},
    )


def _origin_bot():
    return SimpleNamespace(
        bot_id="bot_origin",
        owner_id="super1",
        name="Asistente IUS",
        description="Agente del tenant base",
        business_type="legal",
        status="active",
        config={"system_prompt": "x", "nested": {"temperature": 0.3}},
        channel_ids=["ch_1", "ch_2"],
        metadata_={"origen": "base"},
        total_clients=7,
        total_conversations=3,
        total_messages=42,
    )


def _bot_module(module_key: str, granted: bool, enabled: bool):
    return SimpleNamespace(
        bot_id="bot_origin",
        module_key=module_key,
        granted=granted,
        enabled=enabled,
        granted_by="super1",
        granted_at="2026-01-01T00:00:00+00:00",
    )


def _tenant_module(module_key: str):
    return SimpleNamespace(
        tenant_id="tenant_base",
        module_key=module_key,
        enabled=True,
        granted_by="super1",
        granted_at="2026-01-02T00:00:00+00:00",
    )


def _clone(branding=None):
    base = _base_tenant()
    bot = _origin_bot()
    return build_cloned_rows(
        base,
        [bot],
        {"bot_origin": [_bot_module("appointments", True, True), _bot_module("padron", True, False)]},
        [_tenant_module("appointments")],
        new_tenant_id="tenant_hijo",
        name="Cliente Partner",
        domain="cliente-partner.test",
        branding=branding if branding is not None else {"primary_color": "#222222"},
    ), base, bot


def test_clone_inherits_plan_status_settings_and_merges_branding():
    (tenant_row, _bots, _bot_modules, _tenant_modules), base, _bot = _clone()

    assert tenant_row.tenant_id == "tenant_hijo"
    assert tenant_row.name == "Cliente Partner"
    assert tenant_row.domain == "cliente-partner.test"
    assert tenant_row.parent_tenant_id == base.tenant_id
    # Plan y estado salen del base, no del pedido de alta.
    assert tenant_row.plan_id == "pro"
    assert tenant_row.status == "active"
    assert tenant_row.settings == {"free_signup": True, "nested": {"flag": True}}
    # Deep copy: son dicts nuevos, no los del base.
    assert tenant_row.settings is not base.settings
    assert tenant_row.settings["nested"] is not base.settings["nested"]
    # El branding del alta gana sobre el del base; el resto se preserva.
    assert tenant_row.branding == {"primary_color": "#222222", "tagline": "tagline del base"}
    assert tenant_row.api_key_hash is None


def test_clone_copies_bot_without_channels_or_counters():
    (_tenant_row, bot_rows, _bot_modules, _tenant_modules), _base, origin = _clone()

    assert len(bot_rows) == 1
    bot = bot_rows[0]
    assert bot.bot_id != origin.bot_id
    assert bot.bot_id.startswith("bot_")
    assert bot.tenant_id == "tenant_hijo"
    assert bot.owner_id == origin.owner_id
    assert bot.name == origin.name
    assert bot.description == origin.description
    assert bot.business_type == origin.business_type
    assert bot.status == origin.status
    assert bot.config == origin.config
    assert bot.config is not origin.config
    assert bot.channel_ids == []
    assert bot.metadata_ == {}
    assert (bot.total_clients, bot.total_conversations, bot.total_messages) == (0, 0, 0)


def test_clone_preserves_module_grants_and_enabled_state():
    (_tenant_row, bot_rows, bot_modules, tenant_modules), _base, _bot = _clone()
    new_bot_id = bot_rows[0].bot_id

    grants = {module.module_key: module for module in bot_modules}
    assert set(grants) == {"appointments", "padron"}
    assert all(module.bot_id == new_bot_id for module in bot_modules)
    assert (grants["appointments"].granted, grants["appointments"].enabled) == (True, True)
    assert (grants["padron"].granted, grants["padron"].enabled) == (True, False)
    assert grants["appointments"].granted_by == "super1"
    assert grants["appointments"].granted_at == "2026-01-01T00:00:00+00:00"

    assert [module.module_key for module in tenant_modules] == ["appointments"]
    assert tenant_modules[0].tenant_id == "tenant_hijo"
    assert tenant_modules[0].enabled is True


def test_clone_is_a_snapshot_not_a_reference():
    (_tenant_row, bot_rows, _bot_modules, _tenant_modules), _base, origin = _clone()

    bot_rows[0].config["nested"]["temperature"] = 0.9
    bot_rows[0].config["system_prompt"] = "mutado"

    assert origin.config == {"system_prompt": "x", "nested": {"temperature": 0.3}}


def test_clone_without_bots_yields_no_agents():
    base = _base_tenant()
    tenant_row, bot_rows, bot_modules, tenant_modules = build_cloned_rows(
        base, [], {}, [], new_tenant_id="tenant_hijo", name="Sin agente", domain=None, branding={}
    )

    assert bot_rows == []
    assert bot_modules == []
    assert tenant_modules == []
    assert tenant_row.parent_tenant_id == base.tenant_id
    assert tenant_row.domain is None


def test_is_managed_covers_base_and_direct_children_only():
    base_id = "tenant_base"
    child = SimpleNamespace(tenant_id="tenant_hijo", parent_tenant_id=base_id)
    other = _tenant_row("tenant_otro", "tenant_ajeno")
    base = SimpleNamespace(tenant_id=base_id, parent_tenant_id=None)

    assert PartnerService.is_managed(base_id, base) is True
    assert PartnerService.is_managed(base_id, child) is True
    assert PartnerService.is_managed(base_id, other) is False


def test_base_tenant_id_requires_tenant():
    assert PartnerService.base_tenant_id(SimpleNamespace(tenant_id="tenant_base")) == "tenant_base"

    with pytest.raises(PermissionError):
        PartnerService.base_tenant_id(SimpleNamespace(tenant_id=None))


class FakeDeleteSession:
    """Sesión en memoria para `delete_managed_child`: `get`, `execute`
    (count(*) por tabla y DELETE de bots), `delete`, `commit`, `rollback`."""

    def __init__(self, store, counts):
        self._store = store
        self._counts = counts or {}
        self.deleted = []
        self.deleted_tables = []
        self.committed = False

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, model, pk):
        return self._store.get(pk)

    async def execute(self, stmt):
        if stmt.is_delete:
            self.deleted_tables.append(stmt.table.name)
            return SimpleNamespace(scalar_one=lambda: 0)
        try:
            table = stmt.get_final_froms()[0].name
        except (AttributeError, IndexError):
            table = None
        count = self._counts.get(table, 0)
        return SimpleNamespace(scalar_one=lambda: count)

    async def delete(self, obj):
        self.deleted.append(obj)

    async def commit(self):
        self.committed = True

    async def rollback(self):
        pass


def _patch_session(monkeypatch, session):
    monkeypatch.setattr(ps, "AsyncSessionLocal", lambda: session)


def _tenant_row(tenant_id, parent_tenant_id):
    """Fila mínima que `to_tenant` puede serializar."""
    return SimpleNamespace(
        tenant_id=tenant_id,
        name=tenant_id,
        domain=None,
        status="active",
        branding={},
        settings={},
        plan_id="pro",
        parent_tenant_id=parent_tenant_id,
        created_at=SimpleNamespace(isoformat=lambda: "2026-11-11T00:00:00+00:00"),
        updated_at=SimpleNamespace(isoformat=lambda: "2026-11-11T00:00:00+00:00"),
    )


async def test_delete_managed_child_refuses_when_it_has_users(monkeypatch):
    row = _tenant_row("tenant_hijo", "tenant_base")
    session = FakeDeleteSession({row.tenant_id: row}, {"users": 1})
    _patch_session(monkeypatch, session)

    assert await PartnerService().delete_managed_child("tenant_base", row.tenant_id) is False
    assert session.deleted == []
    assert session.deleted_tables == []


async def test_delete_managed_child_removes_cloned_agents_and_tenant(monkeypatch):
    row = _tenant_row("tenant_hijo", "tenant_base")
    session = FakeDeleteSession({row.tenant_id: row}, {})
    _patch_session(monkeypatch, session)

    assert await PartnerService().delete_managed_child("tenant_base", row.tenant_id) is True
    assert session.deleted_tables == ["bots"]
    assert session.deleted == [row]
    assert session.committed is True


async def test_delete_managed_child_refuses_the_base_tenant(monkeypatch):
    base = _tenant_row("tenant_base", None)
    session = FakeDeleteSession({base.tenant_id: base}, {})
    _patch_session(monkeypatch, session)

    with pytest.raises(ValueError):
        await PartnerService().delete_managed_child("tenant_base", base.tenant_id)
    assert session.deleted == []


async def test_delete_managed_child_rejects_out_of_scope_tenant(monkeypatch):
    other = _tenant_row("tenant_otro", "tenant_ajeno")
    session = FakeDeleteSession({other.tenant_id: other}, {})
    _patch_session(monkeypatch, session)

    with pytest.raises(LookupError):
        await PartnerService().delete_managed_child("tenant_base", other.tenant_id)
