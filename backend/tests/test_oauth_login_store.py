"""
Tests del OAuthLoginStore (login OAuth nativo vía webhook de Nango).

El contrato crítico es peek_result: debe entregar el resultado terminal sin
consumirlo (un fetch-and-delete dejaría el login 'pending' para siempre si la
request que consumió el resultado se aborta al retomar la WebView).
"""

import json

import pytest

from app.services.oauth_login_store import OAuthLoginStore


class FakeRedis:
    """Superficie mínima de redis.Redis usada por OAuthLoginStore."""

    def __init__(self) -> None:
        self.data: dict[str, str] = {}

    def ping(self) -> bool:
        return True

    def setex(self, key, ttl, value) -> None:
        del ttl  # no usado en el fake
        self.data[key] = value

    def get(self, key):
        return self.data.get(key)


@pytest.fixture
def store(monkeypatch):
    import app.services.oauth_login_store as mod

    monkeypatch.setattr(mod.redis, "from_url", lambda url, decode_responses: FakeRedis())
    s = OAuthLoginStore()
    assert s._client is not None
    return s, s._client


async def test_peek_returns_done_repeatedly_without_consuming(store):
    s, redis = store
    s.save_pending("tsignup_abc", "tenant_x", "google")
    s.resolve_success("tsignup_abc", {"token": "jwt-123", "username": "u"})

    first = s.peek_result("tsignup_abc")
    second = s.peek_result("tsignup_abc")

    assert first == {"status": "done", "token": "jwt-123", "username": "u"}
    assert second == first  # el retry del poll vuelve a leer el resultado intacto
    assert json.loads(redis.data["oauth_login:tsignup_abc"])["status"] == "done"


async def test_peek_does_not_expose_pending_record(store):
    s, _ = store
    s.save_pending("tsignup_abc", "tenant_x", "google")

    assert s.peek_result("tsignup_abc") is None


async def test_peek_returns_error_result(store):
    s, _ = store
    s.save_pending("tsignup_abc", "tenant_x", "google")
    s.resolve_error("tsignup_abc", "No se pudo completar el login")

    assert s.peek_result("tsignup_abc") == {
        "status": "error",
        "message": "No se pudo completar el login",
    }


async def test_peek_returns_none_for_unknown_nonce(store):
    s, _ = store
    assert s.peek_result("tsignup_inexistente") is None