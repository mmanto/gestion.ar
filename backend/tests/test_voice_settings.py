"""Unit tests de la traducción gestion.ar → Deepgram (`voice_session_service`).

No requieren Deepgram ni DB: validan el contrato del frame `Settings` y las
decisiones de `VOICE_THINK` (ADR-034).
"""

from types import SimpleNamespace

import pytest

from app.models.bot import BotConfig
from app.models.channel import VoiceConfig
from app.services.voice_session_service import (
    MANAGED_PROMPT_LIMIT,
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


def test_managed_think_has_no_endpoint(monkeypatch):
    monkeypatch.setenv("VOICE_THINK", "managed")
    think = build_think()
    assert think["provider"]["type"] == "open_ai"
    assert "endpoint" not in think


def test_deepseek_think_uses_byo_endpoint(monkeypatch):
    monkeypatch.setenv("VOICE_THINK", "deepseek")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-test")
    monkeypatch.setenv("DEEPSEEK_BASE_URL", "https://api.example.com")
    think = build_think()
    assert think["endpoint"]["url"] == "https://api.example.com/chat/completions"
    assert think["endpoint"]["headers"]["authorization"] == "Bearer sk-test"
    assert "sk-test" not in build_voice_prompt(_bot())


def test_deepseek_without_key_is_config_error(monkeypatch):
    monkeypatch.setenv("VOICE_THINK", "deepseek")
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    with pytest.raises(VoiceConfigError):
        build_think()


def test_claude_think_uses_anthropic_provider(monkeypatch):
    monkeypatch.setenv("VOICE_THINK", "claude")
    monkeypatch.setenv("CLAUDE_API_KEY", "ak-test")
    think = build_think()
    assert think["provider"]["type"] == "anthropic"
    assert think["endpoint"]["headers"]["x-api-key"] == "ak-test"


def test_auto_with_ollama_falls_back_to_managed(monkeypatch):
    monkeypatch.setenv("VOICE_THINK", "auto")
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    assert "endpoint" not in build_think()


def test_managed_prompt_limit_raises(monkeypatch):
    monkeypatch.setenv("VOICE_THINK", "managed")
    bot = _bot(prompt="x" * (MANAGED_PROMPT_LIMIT + 1))
    with pytest.raises(VoiceConfigError):
        build_voice_settings(bot, _channel(), [], [])


def test_byo_long_prompt_is_allowed(monkeypatch):
    monkeypatch.setenv("VOICE_THINK", "deepseek")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-test")
    bot = _bot(prompt="x" * (MANAGED_PROMPT_LIMIT + 1))
    settings = build_voice_settings(bot, _channel(), [], [])
    assert settings["type"] == "Settings"
    assert settings["agent"]["think"]["endpoint"]["url"].endswith("/chat/completions")


def test_settings_use_channel_voice_and_style_suffix(monkeypatch):
    monkeypatch.setenv("VOICE_THINK", "managed")
    settings = build_voice_settings(
        _bot(),
        _channel(listen_model="nova-2", language="es-AR", voice_model="aura-2-sirio-es"),
        [{"type": "History", "role": "user", "content": "hola"}],
        [{"name": "buscar_conocimiento", "description": "x", "parameters": {"type": "object"}}],
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
