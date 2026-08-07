"""
Tests unitarios de device_service.py (login con huella).

Verifica el contrato de seguridad sin infraestructura: el DeviceService
nunca guarda el secreto en claro (solo su hash SHA-256), verifica el secreto
presentado en POST /api/auth/biometric/login, y permite revocar dispositivos.
Se usa una sesión falsa en memoria para no requerir PostgreSQL.
"""

from types import SimpleNamespace

import pytest

from app.db.models import DeviceCredential as DeviceCredentialModel
from app.services.device_service import DeviceService, sha256_hex


class FakeSession:
    """Sesión en memoria que imita la superficie de AsyncSessionLocal que usa
    DeviceService (get / add / commit / execute)."""

    def __init__(self, store):
        self._store = store
        self.added = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, model, pk):
        return self._store.get(pk)

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        for obj in self.added:
            self._store[obj.device_id] = obj
        self.added = []

    async def execute(self, stmt):
        rows = list(self._store.values())
        return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: rows))


@pytest.fixture
def service(monkeypatch):
    store: dict = {}
    import app.services.device_service as module

    monkeypatch.setattr(module, "AsyncSessionLocal", lambda: FakeSession(store))
    svc = DeviceService()
    return svc, store


async def test_enroll_stores_only_hash_never_secret(service):
    svc, store = service
    secret = "s" * 64
    updated = await svc.enroll("operativo_ius", "device-1", sha256_hex(secret), "Moto G73", "android")

    assert updated is False
    row = store["device-1"]
    # Invariante central: el secreto NUNCA se guarda, solo su hash.
    assert secret not in store.values()
    assert row.secret_hash == sha256_hex(secret)
    assert row.secret_hash != secret
    assert row.username == "operativo_ius"
    assert not row.revoked


async def test_verify_correct_secret_marks_last_used(service):
    svc, store = service
    secret = "a" * 64
    await svc.enroll("u", "dev", sha256_hex(secret))

    assert await svc.verify_and_login("u", "dev", secret) is True
    assert store["dev"].last_used_at is not None


async def test_verify_rejects_wrong_secret(service):
    svc, store = service
    await svc.enroll("u", "dev", sha256_hex("a" * 64))
    assert await svc.verify_and_login("u", "dev", "b" * 64) is False


async def test_verify_rejects_wrong_user(service):
    svc, store = service
    await svc.enroll("u", "dev", sha256_hex("a" * 64))
    assert await svc.verify_and_login("otro_usuario", "dev", "a" * 64) is False


async def test_verify_rejects_revoked_device(service):
    svc, store = service
    await svc.enroll("u", "dev", sha256_hex("a" * 64))
    assert await svc.revoke("u", "dev") is True
    assert store["dev"].revoked is True
    assert await svc.verify_and_login("u", "dev", "a" * 64) is False


async def test_revoke_rejects_device_of_other_user(service):
    svc, store = service
    await svc.enroll("u", "dev", sha256_hex("a" * 64))
    assert await svc.revoke("otro_usuario", "dev") is False
    # El rechazo no debe marcar el dispositivo como revocado (None/False = no revocado).
    assert not store["dev"].revoked


async def test_reenroll_existing_device_is_update(service):
    svc, store = service
    await svc.enroll("u", "dev", sha256_hex("a" * 64))
    updated = await svc.enroll("u", "dev", sha256_hex("c" * 64))
    assert updated is True
    # Re-enrolar (p.ej. cambio de huella) reemplaza el hash y reactiva el flag.
    assert store["dev"].secret_hash == sha256_hex("c" * 64)
    assert store["dev"].revoked is False
    assert await svc.verify_and_login("u", "dev", "c" * 64) is True


async def test_sha256_hex_is_64_hex_chars():
    assert len(sha256_hex("x")) == 64
    assert sha256_hex("x") != sha256_hex("y")
