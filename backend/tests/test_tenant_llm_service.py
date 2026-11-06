"""Proveedor de IA por tenant (ADR-038): resolución, guardado y validación.

No requiere Postgres: `AsyncSessionLocal` se reemplaza por una sesión en
memoria (dict por tenant_id) y `validate_llm_credentials` se parchea para no
pegarle a ningún proveedor real.
"""

from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest

from app.claude_service import ClaudeService
from app.deepseek_service import DeepSeekService
from app.db.models import TenantLLMConfig as TenantLLMConfigModel
from app.llm_errors import LLMNotConfiguredError, LLMProviderError
from app.models.tenant import TenantLLMConfigUpdate
from app.openrouter_service import OpenRouterService
from app.services import tenant_llm_service
from app.services.secrets_service import decrypt_secret

# `make test` corre pytest dentro del contenedor (cwd=/app), donde no llega el
# pytest.ini de la raíz del repo (asyncio_mode=auto): sin este marker los tests
# async se saltean silenciosamente.
pytestmark = pytest.mark.asyncio


class _FakeSession:
    """Sesión async mínima: get/add/commit/refresh/delete sobre un dict."""

    def __init__(self, store: dict):
        self._store = store

    async def get(self, _model, pk):
        return self._store.get(pk)

    def add(self, row):
        self._store[row.tenant_id] = row

    async def commit(self):
        return None

    async def refresh(self, row):
        now = datetime.now(timezone.utc)
        if getattr(row, "created_at", None) is None:
            row.created_at = now
        row.updated_at = now

    async def delete(self, row):
        self._store.pop(row.tenant_id, None)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc_info):
        return False


@pytest.fixture
def store(monkeypatch):
    rows: dict = {}
    monkeypatch.setattr(tenant_llm_service, "AsyncSessionLocal", lambda: _FakeSession(rows))
    monkeypatch.setenv("ENCRYPTION_KEY", "clave-de-test")
    return rows


@pytest.fixture
def validated(monkeypatch):
    """Registra las validaciones sin llamar a ningún proveedor."""
    calls: list[tuple[str, str, str]] = []

    def _fake(provider: str, api_key: str, model: str) -> None:
        calls.append((provider, api_key, model))

    monkeypatch.setattr(tenant_llm_service, "validate_llm_credentials", _fake)
    return calls


async def test_missing_config_raises_not_configured(store):
    with pytest.raises(LLMNotConfiguredError):
        await tenant_llm_service.get_llm_for_tenant("tenant_sin_config")

    out = await tenant_llm_service.get_llm_config_out("tenant_sin_config")
    assert out.configured is False


async def test_factory_returns_selected_provider_class(store, validated):
    cases = [
        ("claude", "claude-haiku-4-5-20251001", ClaudeService),
        ("deepseek", "deepseek-v4-flash", DeepSeekService),
        ("openrouter", "deepseek/deepseek-chat", OpenRouterService),
    ]
    for provider, model, expected in cases:
        await tenant_llm_service.save_tenant_llm_config(
            f"tenant_{provider}",
            TenantLLMConfigUpdate(provider=provider, model=model, api_key=f"key-{provider}-1234"),
            updated_by="admin",
        )
        llm = await tenant_llm_service.get_llm_for_tenant(f"tenant_{provider}")
        assert isinstance(llm, expected)
        assert llm.model == model


async def test_save_with_invalid_credentials_does_not_write(store, monkeypatch):
    def _boom(provider: str, api_key: str, model: str) -> None:
        raise LLMProviderError(f"{provider}: API key inválida")

    monkeypatch.setattr(tenant_llm_service, "validate_llm_credentials", _boom)

    with pytest.raises(LLMProviderError):
        await tenant_llm_service.save_tenant_llm_config(
            "tenant_x",
            TenantLLMConfigUpdate(
                provider="openrouter", model="deepseek/deepseek-chat", api_key="sk-or-invalid"
            ),
            updated_by="admin",
        )

    assert store == {}
    assert (await tenant_llm_service.get_llm_config_out("tenant_x")).configured is False


async def test_save_encrypts_key_and_stores_hint(store, validated):
    out = await tenant_llm_service.save_tenant_llm_config(
        "tenant_y",
        TenantLLMConfigUpdate(
            provider="openrouter", model="deepseek/deepseek-chat", api_key="sk-or-v1-abcd1234"
        ),
        updated_by="admin",
    )

    row = store["tenant_y"]
    assert row.api_key_encrypted != "sk-or-v1-abcd1234"
    assert "sk-or-v1-abcd1234" not in row.api_key_encrypted
    assert decrypt_secret(row.api_key_encrypted) == "sk-or-v1-abcd1234"
    assert row.api_key_hint == "1234"
    assert out.configured is True
    assert out.api_key_hint == "1234"
    assert out.provider == "openrouter"
    assert out.updated_by == "admin"
    assert validated == [("openrouter", "sk-or-v1-abcd1234", "deepseek/deepseek-chat")]

    # La key en claro no aparece en la respuesta pública del backoffice.
    assert "sk-or-v1-abcd1234" not in out.model_dump_json()


async def test_omitted_key_reuses_stored_key_for_same_provider(store, monkeypatch):
    monkeypatch.setattr(tenant_llm_service, "validate_llm_credentials", lambda *a: None)
    await tenant_llm_service.save_tenant_llm_config(
        "tenant_z",
        TenantLLMConfigUpdate(provider="claude", model="claude-haiku-4-5-20251001", api_key="sk-ant-11122233"),
        updated_by="admin",
    )

    seen: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        tenant_llm_service, "validate_llm_credentials", lambda p, k, m: seen.append((p, k, m))
    )
    await tenant_llm_service.save_tenant_llm_config(
        "tenant_z",
        TenantLLMConfigUpdate(provider="claude", model="claude-sonnet-4-6"),
        updated_by="otro-admin",
    )

    # Reusó la key guardada (descifrada) y actualizó modelo/updated_by.
    assert seen == [("claude", "sk-ant-11122233", "claude-sonnet-4-6")]
    assert store["tenant_z"].model == "claude-sonnet-4-6"
    assert store["tenant_z"].updated_by == "otro-admin"


async def test_provider_change_without_key_is_rejected(store, validated):
    await tenant_llm_service.save_tenant_llm_config(
        "tenant_w",
        TenantLLMConfigUpdate(provider="claude", model="claude-haiku-4-5-20251001", api_key="sk-ant-11122233"),
        updated_by="admin",
    )

    with pytest.raises(ValueError) as exc:
        await tenant_llm_service.save_tenant_llm_config(
            "tenant_w",
            TenantLLMConfigUpdate(provider="deepseek", model="deepseek-v4-flash"),
            updated_by="admin",
        )
    assert "cambiar de proveedor" in str(exc.value)
    assert store["tenant_w"].provider == "claude"


async def test_save_without_key_and_without_row_is_rejected(store, validated):
    with pytest.raises(ValueError) as exc:
        await tenant_llm_service.save_tenant_llm_config(
            "tenant_v",
            TenantLLMConfigUpdate(provider="deepseek", model="deepseek-v4-flash"),
            updated_by="admin",
        )
    assert "Falta la API key" in str(exc.value)


async def test_validate_persists_last_error_and_last_validated_at(store, monkeypatch):
    monkeypatch.setattr(tenant_llm_service, "validate_llm_credentials", lambda *a: None)
    await tenant_llm_service.save_tenant_llm_config(
        "tenant_u",
        TenantLLMConfigUpdate(provider="deepseek", model="deepseek-v4-flash", api_key="sk-deep-12345678"),
        updated_by="admin",
    )

    def _fail(provider: str, api_key: str, model: str) -> None:
        raise LLMProviderError("DeepSeek: credit balance is too low")

    monkeypatch.setattr(tenant_llm_service, "validate_llm_credentials", _fail)
    valid, error = await tenant_llm_service.test_tenant_llm_config("tenant_u")

    assert valid is False
    assert error == "DeepSeek: credit balance is too low"
    out = await tenant_llm_service.get_llm_config_out("tenant_u")
    assert out.last_error == "DeepSeek: credit balance is too low"

    monkeypatch.setattr(tenant_llm_service, "validate_llm_credentials", lambda *a: None)
    valid_again, error_again = await tenant_llm_service.test_tenant_llm_config("tenant_u")
    assert (valid_again, error_again) == (True, None)
    assert (await tenant_llm_service.get_llm_config_out("tenant_u")).last_error is None


async def test_test_propagates_not_configured(store):
    with pytest.raises(LLMNotConfiguredError):
        await tenant_llm_service.test_tenant_llm_config("tenant_sin_config")


async def test_openrouter_validation_rejects_error_inside_200(monkeypatch):
    """OpenRouter devuelve 200 con `choices[0].error` cuando el modelo no tiene
    proveedor: la validación tiene que rechazarlo, si no la config queda
    guardada como válida y el chat muere en el primer turno."""
    key_response = MagicMock()
    key_response.status_code = 200

    chat_response = MagicMock()
    chat_response.is_error = False
    chat_response.json.return_value = {
        "choices": [{"error": {"message": "No endpoints found for model"}}]
    }

    client = MagicMock()
    client.__enter__.return_value = client
    client.__exit__.return_value = False
    client.get.return_value = key_response
    client.post.return_value = chat_response

    monkeypatch.setattr(tenant_llm_service.httpx, "Client", lambda **kwargs: client)

    with pytest.raises(LLMProviderError) as exc:
        tenant_llm_service.validate_llm_credentials(
            "openrouter", "sk-or-v1-test", "deepseek-v4-flash"
        )

    assert "No endpoints found for model" in str(exc.value)
    assert "sk-or-v1-test" not in str(exc.value)
    # El ping no deja que el razonamiento se coma los 16 tokens.
    assert client.post.call_args.kwargs["json"]["reasoning"] == {"enabled": False}


async def test_delete_removes_config(store, validated):
    await tenant_llm_service.save_tenant_llm_config(
        "tenant_d",
        TenantLLMConfigUpdate(provider="openrouter", model="deepseek/deepseek-chat", api_key="sk-or-12345678"),
        updated_by="admin",
    )
    assert await tenant_llm_service.delete_tenant_llm_config("tenant_d") is True
    assert await tenant_llm_service.delete_tenant_llm_config("tenant_d") is False
    with pytest.raises(LLMNotConfiguredError):
        await tenant_llm_service.get_llm_for_tenant("tenant_d")
