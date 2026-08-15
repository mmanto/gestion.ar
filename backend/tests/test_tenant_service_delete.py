"""
Tests unitarios de tenant_service.delete_tenant.

Verifica el contrato de borrado del tenant sin infraestructura: el service
nunca borra en cascada datos de negocio — rechaza (devuelve False) cuando el
tenant tiene dependientes (bots, usuarios, canales, clientes, conversaciones,
push_subscriptions) y solo borra cuando está vacío. Se usa una sesión falsa
en memoria para no requerir PostgreSQL.
"""

from types import SimpleNamespace

import pytest

import app.services.tenant_service as ts
from app.services.tenant_service import TenantService


class FakeSession:
    """Sesión en memoria que imita la superficie de AsyncSessionLocal que usa
    TenantService.delete_tenant (get / execute / delete / commit / rollback)."""

    def __init__(self, store, counts):
        self._store = store
        self._counts = counts or {}  # dict[tabla] -> número de dependientes
        self.deleted = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, model, pk):
        return self._store.get(pk)

    async def execute(self, stmt):
        # delete_tenant solo ejecuta SELECT count(*) FROM <tabla> WHERE tenant_id=...
        try:
            table = stmt.get_final_froms()[0].name
        except (AttributeError, IndexError):
            table = None
        n = self._counts.get(table, 0)
        return SimpleNamespace(scalar_one=lambda: n)

    async def delete(self, obj):
        self.deleted.append(obj)

    async def commit(self):
        pass

    async def rollback(self):
        pass


@pytest.fixture
def service(monkeypatch):
    svc = TenantService()

    def set_session(session):
        monkeypatch.setattr(ts, "AsyncSessionLocal", lambda: session)

    return svc, set_session


def _tenant_row():
    return SimpleNamespace(tenant_id="tenant_abc", name="t", domain="t.ar")


async def test_delete_missing_tenant_returns_false(service):
    svc, set_session = service
    set_session(FakeSession({}, {}))
    assert await svc.delete_tenant("tenant_abc") is False


async def test_delete_empty_tenant_deletes(service):
    svc, set_session = service
    row = _tenant_row()
    session = FakeSession({row.tenant_id: row}, {})
    set_session(session)
    assert await svc.delete_tenant(row.tenant_id) is True
    assert session.deleted == [row]


async def test_delete_refuses_when_has_bots(service):
    svc, set_session = service
    row = _tenant_row()
    session = FakeSession({row.tenant_id: row}, {"bots": 1})
    set_session(session)
    assert await svc.delete_tenant(row.tenant_id) is False
    assert session.deleted == []


async def test_delete_refuses_when_has_users(service):
    svc, set_session = service
    row = _tenant_row()
    session = FakeSession({row.tenant_id: row}, {"users": 1})
    set_session(session)
    assert await svc.delete_tenant(row.tenant_id) is False
    assert session.deleted == []


async def test_delete_refuses_when_has_conversations(service):
    svc, set_session = service
    row = _tenant_row()
    session = FakeSession({row.tenant_id: row}, {"conversations": 1})
    set_session(session)
    assert await svc.delete_tenant(row.tenant_id) is False
    assert session.deleted == []