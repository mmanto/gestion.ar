"""
Tests unitarios de `TenantService.update_tenant` al vaciar `domain`.

Contrato: mandar `domain: null` (o blanco) borra el dominio propio y el tenant
vuelve a resolverse por su URL interna; omitir `domain` no lo toca. El resto de
los campos opcionales conservan la semántica "None = no tocar".
"""

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

import app.services.tenant_service as ts
from app.models.tenant import TenantUpdate
from app.services.tenant_service import TenantService


class FakeSession:
    def __init__(self, store):
        self._store = store
        self.commits = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, model, pk):
        return self._store.get(pk)

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        pass

    async def refresh(self, row):
        pass


def _tenant_row(domain="t.ar"):
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        tenant_id="tenant_abc",
        name="t",
        domain=domain,
        slug="t",
        status="active",
        branding={},
        settings={},
        plan_id="pro",
        parent_tenant_id=None,
        created_at=now,
        updated_at=now,
    )


@pytest.fixture
def service(monkeypatch):
    svc = TenantService()

    def set_session(session):
        monkeypatch.setattr(ts, "AsyncSessionLocal", lambda: session)

    return svc, set_session


def test_blank_domain_normalizes_to_null():
    assert TenantUpdate(domain="   ").model_dump(exclude_unset=True) == {"domain": None}


def test_omitted_domain_stays_unset():
    assert "domain" not in TenantUpdate(name="otro").model_dump(exclude_unset=True)


async def test_explicit_null_domain_clears_it(service):
    svc, set_session = service
    row = _tenant_row()
    set_session(FakeSession({row.tenant_id: row}))

    updated = await svc.update_tenant(row.tenant_id, TenantUpdate(domain=None))

    assert row.domain is None
    assert updated.domain is None


async def test_blank_domain_clears_it(service):
    svc, set_session = service
    row = _tenant_row()
    set_session(FakeSession({row.tenant_id: row}))

    await svc.update_tenant(row.tenant_id, TenantUpdate(domain="  "))

    assert row.domain is None


async def test_omitted_domain_is_preserved(service):
    svc, set_session = service
    row = _tenant_row()
    set_session(FakeSession({row.tenant_id: row}))

    await svc.update_tenant(row.tenant_id, TenantUpdate(name="nuevo"))

    assert row.domain == "t.ar"
    assert row.name == "nuevo"


async def test_null_in_other_fields_does_not_clear_them(service):
    svc, set_session = service
    row = _tenant_row()
    set_session(FakeSession({row.tenant_id: row}))

    await svc.update_tenant(row.tenant_id, TenantUpdate(plan_id=None, branding=None))

    assert row.plan_id == "pro"
    assert row.branding == {}
