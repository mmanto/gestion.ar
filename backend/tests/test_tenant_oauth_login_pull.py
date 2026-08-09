"""
Tests del fallback "pull" del login OAuth mobile (tenant_oauth_router).

`/connect/login/status` resuelve el login activamente buscando la connection
en Nango por `endUser.id` cuando el webhook (push) no llega — es el mecanismo
que hace el flujo mobile independiente de la entrega del webhook de Nango.
"""

import importlib.util
from pathlib import Path

import pytest

# `app.routers/__init__.py` importa todos los routers (alguno arrastra deps
# pesadas tipo qrcode/anthropic); cargamos SOLO el módulo bajo test por ruta.
_router_path = Path(__file__).resolve().parent.parent / "app" / "routers" / "tenant_oauth_router.py"
_spec = importlib.util.spec_from_file_location("tenant_oauth_router", _router_path)
router = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(router)


class FakeStore:
    """OAuthLoginStore en memoria con la superficie que usa el fallback pull."""

    def __init__(self) -> None:
        self.data: dict[str, dict] = {}

    def save_pending(self, nonce_id: str, tenant_id: str, provider: str) -> None:
        self.data[nonce_id] = {"status": "pending", "tenant_id": tenant_id, "provider": provider}

    def get_pending(self, nonce_id: str):
        d = self.data.get(nonce_id)
        return d if d and d.get("status") == "pending" else None

    def peek_result(self, nonce_id: str):
        d = self.data.get(nonce_id)
        if not d or d.get("status") == "pending":
            return None
        return d

    def resolve_success(self, nonce_id: str, result: dict) -> None:
        self.data[nonce_id] = {"status": "done", **result}

    def resolve_error(self, nonce_id: str, message: str) -> None:
        self.data[nonce_id] = {"status": "error", "message": message}


@pytest.fixture
def pull_env(monkeypatch):
    store = FakeStore()
    monkeypatch.setattr(router, "_login_store", store)
    store.save_pending("tsignup_abc", "tenant_x", "google")
    return store


async def test_pull_resolves_pending_login_when_connection_exists(pull_env, monkeypatch):
    async def fake_find(nonce_id):
        assert nonce_id == "tsignup_abc"
        return "conn-1"

    async def fake_complete(tenant_id, provider, connection_id):
        assert (tenant_id, provider, connection_id) == ("tenant_x", "google", "conn-1")
        return {"token": "jwt-1", "username": "u"}

    monkeypatch.setattr(router, "_find_connection_by_end_user", fake_find)
    monkeypatch.setattr(router, "_complete_tenant_login", fake_complete)

    result = await router._try_resolve_pending_login("tsignup_abc")

    assert result == {"status": "done", "token": "jwt-1", "username": "u"}
    assert pull_env.data["tsignup_abc"]["status"] == "done"


async def test_pull_returns_none_when_no_connection_yet(pull_env, monkeypatch):
    async def fake_find(nonce_id):
        return None

    monkeypatch.setattr(router, "_find_connection_by_end_user", fake_find)

    assert await router._try_resolve_pending_login("tsignup_abc") is None
    assert pull_env.data["tsignup_abc"]["status"] == "pending"  # no se marca error


async def test_pull_skips_lookup_without_pending(pull_env, monkeypatch):
    calls = []

    async def fake_find(nonce_id):
        calls.append(nonce_id)
        return "conn-1"

    monkeypatch.setattr(router, "_find_connection_by_end_user", fake_find)

    assert await router._try_resolve_pending_login("tsignup_sin_pending") is None
    assert calls == []  # sin registro pending no se consulta Nango


async def test_pull_marks_error_when_login_fails(pull_env, monkeypatch):
    async def fake_find(nonce_id):
        return "conn-1"

    async def fake_complete(*args):
        raise router._LoginError("El login con google no está disponible en este momento")

    monkeypatch.setattr(router, "_find_connection_by_end_user", fake_find)
    monkeypatch.setattr(router, "_complete_tenant_login", fake_complete)

    result = await router._try_resolve_pending_login("tsignup_abc")

    assert result == {"status": "error", "message": "El login con google no está disponible en este momento"}
    assert pull_env.data["tsignup_abc"]["status"] == "error"


async def test_status_uses_pull_when_pending(pull_env, monkeypatch):
    async def fake_find(nonce_id):
        return "conn-1"

    async def fake_complete(tenant_id, provider, connection_id):
        return {"token": "jwt-1", "username": "u"}

    monkeypatch.setattr(router, "_verify_nonce", lambda nonce: ("tsignup_abc", "tenant_x"))
    monkeypatch.setattr(router, "_find_connection_by_end_user", fake_find)
    monkeypatch.setattr(router, "_complete_tenant_login", fake_complete)

    result = await router.tenant_login_status("nonce-firmado")

    assert result["status"] == "done"
    assert result["token"] == "jwt-1"


async def test_status_prefers_already_resolved_result(pull_env, monkeypatch):
    pull_env.resolve_success("tsignup_abc", {"token": "jwt-ya", "username": "u"})
    calls = []

    async def fake_find(nonce_id):
        calls.append(nonce_id)
        return "conn-1"

    monkeypatch.setattr(router, "_verify_nonce", lambda nonce: ("tsignup_abc", "tenant_x"))
    monkeypatch.setattr(router, "_find_connection_by_end_user", fake_find)

    result = await router.tenant_login_status("nonce-firmado")

    assert result["status"] == "done"
    assert result["token"] == "jwt-ya"
    assert calls == []  # resultado ya resuelto: no se consulta Nango


async def test_status_pending_when_nothing_resolves(pull_env, monkeypatch):
    async def fake_find(nonce_id):
        return None

    monkeypatch.setattr(router, "_verify_nonce", lambda nonce: ("tsignup_abc", "tenant_x"))
    monkeypatch.setattr(router, "_find_connection_by_end_user", fake_find)

    assert await router.tenant_login_status("nonce-firmado") == {"status": "pending"}