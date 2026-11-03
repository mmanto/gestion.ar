"""Unit tests de la traducción gestion.ar → Deepgram (`voice_session_service`).

No requieren Deepgram ni DB: validan el contrato del frame `Settings` y que el
LLM de voz sea el del tenant (ADR-038) — antes dependía de
`VOICE_THINK`/`LLM_PROVIDER`.
"""

from types import SimpleNamespace

import pytest

from app.models.bot import BotConfig
from app.models.channel import VoiceConfig
from app.services.tenant_llm_service import ResolvedLLMConfig
from app.services.voice_session_service import (
    VOICE_STYLE_SUFFIX,
    VoiceConfigError,
    build_think,
    build_voice_prompt,
    build_voice_settings,
    history_messages,
)


def _bot(prompt="Eres el asistente del municipio.", **config):
    return SimpleNamespace(
        bot_id="bot_test",
        config=BotConfig(system_prompt=prompt, welcome_message="Hola, ¿qué necesitás?", **config),
    )


def _channel(**voice):
    return SimpleNamespace(voice_config=VoiceConfig(**voice))


def _config(provider: str, model: str = "modelo-del-tenant", key: str = "key-del-tenant"):
    return ResolvedLLMConfig(
        tenant_id="tenant_test",
        provider=provider,
        model=model,
        api_key=key,
        api_key_hint=key[-4:],
    )


def test_deepseek_think_uses_byo_endpoint(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_BASE_URL", "https://api.example.com/")
    think = build_think(_config("deepseek", "deepseek-v4-flash", "sk-test"))

    assert think["provider"] == {"type": "open_ai", "model": "deepseek-v4-flash"}
    assert think["endpoint"]["url"] == "https://api.example.com/chat/completions"
    assert think["endpoint"]["headers"]["authorization"] == "Bearer sk-test"


def test_openrouter_think_uses_openrouter_endpoint(monkeypatch):
    monkeypatch.setenv("OPENROUTER_BASE_URL", "https://openrouter.example/api/v1")
    think = build_think(_config("openrouter", "deepseek/deepseek-chat", "sk-or-test"))

    assert think["provider"] == {"type": "open_ai", "model": "deepseek/deepseek-chat"}
    assert think["endpoint"]["url"] == "https://openrouter.example/api/v1/chat/completions"
    assert think["endpoint"]["headers"]["authorization"] == "Bearer sk-or-test"


def test_claude_think_uses_anthropic_provider():
    think = build_think(_config("claude", "claude-haiku-4-5-20251001", "sk-ant-test"))

    assert think["provider"] == {"type": "anthropic", "model": "claude-haiku-4-5-20251001"}
    assert think["endpoint"]["url"] == "https://api.anthropic.com/v1/messages"
    assert think["endpoint"]["headers"]["x-api-key"] == "sk-ant-test"
    assert think["endpoint"]["headers"]["anthropic-version"] == "2023-06-01"


def test_unknown_provider_is_config_error():
    with pytest.raises(VoiceConfigError):
        build_think(_config("ollama"))


def test_tenant_key_never_leaks_into_prompt():
    config = _config("deepseek", key="sk-secreto-1234")
    settings = build_voice_settings(_bot(), _channel(), [], [], config)

    assert "sk-secreto-1234" not in build_voice_prompt(_bot())
    assert "sk-secreto-1234" not in settings["agent"]["think"]["prompt"]


def test_long_prompt_is_allowed_with_byo_llm():
    # Ya no hay tope de prompt (se eliminó el LLM gestionado por Deepgram).
    bot = _bot(prompt="x" * 40_000)
    settings = build_voice_settings(bot, _channel(), [], [], _config("openrouter"))

    assert settings["type"] == "Settings"
    assert settings["agent"]["think"]["endpoint"]["url"].endswith("/chat/completions")


def test_settings_use_channel_voice_and_style_suffix():
    settings = build_voice_settings(
        _bot(),
        _channel(listen_model="nova-2", language="es-AR", voice_model="aura-2-sirio-es"),
        [{"type": "History", "role": "user", "content": "hola"}],
        [{"name": "buscar_conocimiento", "description": "x", "parameters": {"type": "object"}}],
        _config("deepseek"),
    )
    agent = settings["agent"]

    assert settings["audio"]["input"] == {"encoding": "linear16", "sample_rate": 16000}
    assert settings["audio"]["output"]["sample_rate"] == 24000
    assert agent["listen"]["provider"]["model"] == "nova-2"
    assert agent["listen"]["provider"]["language"] == "es-AR"
    assert agent["speak"]["provider"]["model"] == "aura-2-sirio-es"
    assert agent["greeting"] == "Hola, ¿qué necesitás?"
    assert agent["context"]["messages"] == [{"type": "History", "role": "user", "content": "hola"}]
    assert agent["think"]["prompt"].endswith(VOICE_STYLE_SUFFIX)
    assert agent["think"]["functions"][0]["name"] == "buscar_conocimiento"


def test_history_messages_takes_last_turns():
    conv = {
        "messages": [
            {"role": "user", "content": "uno"},
            {"role": "assistant", "content": "dos"},
            {"role": "system", "content": "ignorado"},
        ]
    }
    assert history_messages(conv) == [
        {"type": "History", "role": "user", "content": "uno"},
        {"type": "History", "role": "assistant", "content": "dos"},
    ]
