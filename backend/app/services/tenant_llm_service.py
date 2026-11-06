"""
Proveedor de IA por tenant (ADR-038).

Cada tenant elige proveedor (Claude, DeepSeek u OpenRouter), modelo y su propia
API key desde el backoffice (Ajustes › Proveedor de IA). La key se valida
contra el proveedor ANTES de guardarse y queda cifrada con `ENCRYPTION_KEY`
(ver secrets_service.py).

Decisiones que conviene tener presentes al tocar este archivo:

- La config se lee de la BD en CADA turno (sin caché): una rotación o
  revocación de key aplica en el mensaje siguiente, sin reiniciar el proceso.
- Sin fila para el tenant el agente NO responde (`LLMNotConfiguredError`); no
  hay fallback a `ANTHROPIC_API_KEY`/`DEEPSEEK_API_KEY` de plataforma. Esas
  keys sobreviven sólo para paths sin tenant (legacy) y para Ollama.
- La key en claro vive únicamente en memoria del proceso: no va a logs, ni a
  respuestas de la API (se expone `api_key_hint`), ni al `repr()` del dataclass.
"""

import asyncio
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import httpx

from app.claude_service import ClaudeService
from app.db.database import AsyncSessionLocal
from app.db.models import TenantLLMConfig as TenantLLMConfigModel
from app.deepseek_service import DeepSeekService
from app.llm_errors import LLMNotConfiguredError, LLMProviderError
from app.models.tenant import TenantLLMConfigOut, TenantLLMConfigUpdate
from app.openrouter_service import DEFAULT_BASE_URL as OPENROUTER_DEFAULT_BASE_URL
from app.openrouter_service import OpenRouterService, choice_error
from app.services.secrets_service import decrypt_secret, encrypt_secret

#: Timeout fijo de la validación desde la UI (independiente de
#: `*_TIMEOUT` de runtime: el admin está esperando la respuesta en pantalla).
VALIDATION_TIMEOUT = 20.0
_LAST_ERROR_MAX = 500

_NOT_CONFIGURED_MESSAGE = (
    "El tenant no tiene configurado un proveedor de IA "
    "(Ajustes › Proveedor de IA)"
)


@dataclass(frozen=True)
class ResolvedLLMConfig:
    """Config descifrada de un tenant. `api_key` queda fuera del `repr`."""

    tenant_id: str
    provider: str
    model: str
    api_key: str = field(repr=False)
    api_key_hint: str


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Validación de credenciales ────────────────────────────────────────────────

def _openrouter_error_message(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return (response.text or "").strip()[:300] or "sin detalle"
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict) and error.get("message"):
            return str(error["message"])
        if isinstance(error, str) and error:
            return error
    return "respuesta inesperada del proveedor"


def _validate_openrouter(api_key: str, model: str) -> None:
    base = os.getenv("OPENROUTER_BASE_URL", OPENROUTER_DEFAULT_BASE_URL).rstrip("/")
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    try:
        with httpx.Client(timeout=VALIDATION_TIMEOUT) as client:
            key_response = client.get(f"{base}/key", headers=headers)
            if key_response.status_code != 200:
                raise LLMProviderError(
                    f"OpenRouter (HTTP {key_response.status_code}): "
                    f"{_openrouter_error_message(key_response)}"
                )

            chat_response = client.post(
                f"{base}/chat/completions",
                headers=headers,
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": "ping"}],
                    "max_tokens": 16,
                    "stream": False,
                    # Sin esto un modelo/upstream que razona por default gasta
                    # los 16 tokens en reasoning y el ping vuelve vacío.
                    "reasoning": {"enabled": False},
                },
            )
            if chat_response.is_error:
                raise LLMProviderError(
                    f"OpenRouter (HTTP {chat_response.status_code}): "
                    f"{_openrouter_error_message(chat_response)}"
                )

            # OpenRouter puede devolver 200 con el error de ruteo en
            # `choices[0].error` (modelo inexistente, sin proveedor, …): sin
            # este chequeo una config rota se guardaba como válida y el chat
            # moría recién en el primer turno.
            try:
                payload = chat_response.json()
            except ValueError:
                raise LLMProviderError("OpenRouter: respuesta inválida (no es JSON)")
            error = choice_error(payload)
            if error:
                raise LLMProviderError(f"OpenRouter: {error}")
    except httpx.RequestError as exc:
        raise LLMProviderError(
            f"No se pudo contactar a OpenRouter: {exc}"
        )


def validate_llm_credentials(provider: str, api_key: str, model: str) -> None:
    """Llama al proveedor con un pedido mínimo para validar key + modelo.

    Síncrona a propósito (se ejecuta con `asyncio.to_thread`) porque los tres
    SDK/clientes son bloqueantes. Siempre traduce la falla a `LLMProviderError`
    con un mensaje apto para mostrar en la UI (nunca incluye la key).
    """
    if provider == "openrouter":
        _validate_openrouter(api_key, model)
        return

    try:
        if provider == "claude":
            service = ClaudeService(api_key=api_key, model=model, quiet=True)
            service.sync_generate(
                "ping",
                [{"role": "user", "content": "ping"}],
                max_tokens=1,
            )
        elif provider == "deepseek":
            service = DeepSeekService(api_key=api_key, model=model, quiet=True)
            service.sync_generate(
                "ping",
                [{"role": "user", "content": "ping"}],
                max_tokens=16,
            )
        else:
            raise LLMProviderError(f"Proveedor de IA desconocido: {provider}")
    except LLMProviderError:
        raise
    except Exception as exc:  # SDK/HTTP/red: el mensaje va a la UI
        label = "Claude" if provider == "claude" else "DeepSeek"
        raise LLMProviderError(f"{label}: {exc}")


# ── Resolución (runtime del agente, voz, tareas auxiliares) ──────────────────

async def get_tenant_llm_config(tenant_id: str) -> Optional[ResolvedLLMConfig]:
    """Config descifrada del tenant, o None si todavía no cargó ninguna."""
    async with AsyncSessionLocal() as session:
        row = await session.get(TenantLLMConfigModel, tenant_id)
        if row is None:
            return None
        return ResolvedLLMConfig(
            tenant_id=row.tenant_id,
            provider=row.provider,
            model=row.model,
            api_key=decrypt_secret(row.api_key_encrypted),
            api_key_hint=row.api_key_hint,
        )


async def get_llm_for_tenant(tenant_id: str):
    """Servicio LLM del tenant, listo para `generate_response`.

    Se construye en cada llamado (sin caché) para que una key rotada aplique en
    el turno siguiente. `quiet=True`: no loguea el banner en cada mensaje.
    """
    config = await get_tenant_llm_config(tenant_id)
    if config is None:
        raise LLMNotConfiguredError(_NOT_CONFIGURED_MESSAGE)

    if config.provider == "claude":
        return ClaudeService(api_key=config.api_key, model=config.model, quiet=True)
    if config.provider == "deepseek":
        return DeepSeekService(
            api_key=config.api_key,
            model=config.model,
            base_url=os.getenv("DEEPSEEK_BASE_URL"),
            quiet=True,
        )
    if config.provider == "openrouter":
        return OpenRouterService(api_key=config.api_key, model=config.model)
    raise LLMProviderError(f"Proveedor de IA desconocido: {config.provider}")


async def get_llm_config_out(tenant_id: str) -> TenantLLMConfigOut:
    """Metadatos de la config para el backoffice (sin key ni ciphertext)."""
    async with AsyncSessionLocal() as session:
        row = await session.get(TenantLLMConfigModel, tenant_id)
        if row is None:
            return TenantLLMConfigOut(configured=False)
        return TenantLLMConfigOut(
            configured=True,
            provider=row.provider,
            model=row.model,
            api_key_hint=row.api_key_hint,
            last_validated_at=_iso(row.last_validated_at),
            last_error=row.last_error,
            updated_at=_iso(row.updated_at),
            updated_by=row.updated_by,
        )


async def save_tenant_llm_config(
    tenant_id: str, data: TenantLLMConfigUpdate, updated_by: str
) -> TenantLLMConfigOut:
    """Valida y guarda (upsert) la config del tenant.

    Sin `api_key` se reusa la guardada sólo si NO cambió el proveedor: una key
    de OpenRouter no sirve para Claude ni DeepSeek. Valida contra el proveedor
    antes de escribir, así una key inválida no pisa la config vigente.
    """
    provider = data.provider
    model = data.model.strip()
    api_key = (data.api_key or "").strip()

    async with AsyncSessionLocal() as session:
        row = await session.get(TenantLLMConfigModel, tenant_id)

        if not api_key:
            if row is None:
                raise ValueError("Falta la API key del proveedor")
            if row.provider != provider:
                raise ValueError("Al cambiar de proveedor tenés que cargar su API key")
            api_key = decrypt_secret(row.api_key_encrypted)

        # Antes de escribir: una key/modelo que el proveedor rechaza no debe
        # dejar la config en un estado que rompa los turnos.
        await asyncio.to_thread(validate_llm_credentials, provider, api_key, model)

        encrypted = encrypt_secret(api_key)
        if row is None:
            row = TenantLLMConfigModel(tenant_id=tenant_id)
            session.add(row)
        row.provider = provider
        row.model = model
        row.api_key_encrypted = encrypted
        row.api_key_hint = api_key[-4:]
        row.last_validated_at = _now()
        row.last_error = None
        row.updated_by = updated_by
        await session.commit()
        await session.refresh(row)

        return TenantLLMConfigOut(
            configured=True,
            provider=row.provider,
            model=row.model,
            api_key_hint=row.api_key_hint,
            last_validated_at=_iso(row.last_validated_at),
            last_error=row.last_error,
            updated_at=_iso(row.updated_at),
            updated_by=row.updated_by,
        )


async def test_tenant_llm_config(tenant_id: str) -> tuple[bool, Optional[str]]:
    """Revalida la config guardada. Nunca propaga el error del proveedor: lo
    persiste en `last_error` y lo devuelve para mostrarlo en Ajustes."""
    config = await get_tenant_llm_config(tenant_id)
    if config is None:
        raise LLMNotConfiguredError(_NOT_CONFIGURED_MESSAGE)

    error: Optional[str] = None
    try:
        await asyncio.to_thread(
            validate_llm_credentials, config.provider, config.api_key, config.model
        )
    except LLMProviderError as exc:
        error = str(exc)

    async with AsyncSessionLocal() as session:
        row = await session.get(TenantLLMConfigModel, tenant_id)
        if row is not None:
            row.last_error = error[:_LAST_ERROR_MAX] if error else None
            if error is None:
                row.last_validated_at = _now()
            await session.commit()

    return (error is None, error)


async def delete_tenant_llm_config(tenant_id: str) -> bool:
    """Borra la config: el agente del tenant deja de responder hasta que se
    cargue otra."""
    async with AsyncSessionLocal() as session:
        row = await session.get(TenantLLMConfigModel, tenant_id)
        if row is None:
            return False
        await session.delete(row)
        await session.commit()
        return True
