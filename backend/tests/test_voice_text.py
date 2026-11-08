"""Tests del turno escrito del canal de voz (`POST /api/public/voice/text`).

No tocan la DB ni abren sockets: se sustituyen los servicios por dobles y se
valida lo que hace el endpoint con el turno de `AgentService.run_turn` —
historial reanudado, persistencia con `source="text"`, notificación al staff y
contadores— además del mapeo de errores del router.
"""

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.routers import voice_router
from app.services import voice_text_service
from app.services.agent_service import TurnResult
from app.services.voice_text_service import TextTurnError, chat_history, run_text_turn

BOT = SimpleNamespace(bot_id="bot_test", tenant_id="tenant_test")
CHANNEL = SimpleNamespace(channel_id="channel_test", bot_id="bot_test")


class FakeConversations:
    def __init__(self, latest=None):
        self.latest = latest
        self.created = []
        self.messages = []

    async def get_latest_conversation_by_user(self, user_id, bot_id=None, channel_id=None):
        return self.latest

    async def create_conversation(self, user_id, metadata=None, bot_id=None, client_id=None, channel=None):
        self.created.append(
            {
                "user_id": user_id,
                "metadata": metadata or {},
                "bot_id": bot_id,
                "client_id": client_id,
                "channel": channel,
            }
        )
        return "conv_nueva"

    async def add_message(self, conversation_id, role, content, metadata=None):
        self.messages.append((conversation_id, role, content, metadata or {}))


class FakeClients:
    def __init__(self):
        self.counters = []

    async def get_or_create_client(self, **kwargs):
        return SimpleNamespace(
            bot_id=kwargs["bot_id"], client_id="client_test", name="Vecina"
        )

    async def increment_counters(self, client_id, **kwargs):
        self.counters.append((client_id, kwargs))


class FakeAgent:
    def __init__(self, result):
        self.result = result
        self.calls = []

    async def run_turn(self, bot, **kwargs):
        self.calls.append({"bot": bot, **kwargs})
        return self.result


def _install(monkeypatch, *, latest, result):
    conversations = FakeConversations(latest)
    clients = FakeClients()
    agent = FakeAgent(result)
    notified = []

    async def fake_notify(**kwargs):
        notified.append(kwargs)

    monkeypatch.setattr(voice_text_service, "get_conversation_service", lambda: conversations)
    monkeypatch.setattr(voice_text_service, "get_client_service", lambda: clients)
    monkeypatch.setattr(voice_text_service, "get_agent_service", lambda: agent)
    monkeypatch.setattr(voice_text_service, "notify_staff_of_client_message", fake_notify)
    return conversations, clients, agent, notified


CONVERSACION_PREVIA = {
    "conversation_id": "conv_previa",
    "messages": [
        {"role": "user", "content": "hola"},
        {"role": "assistant", "content": "buenas"},
        {"role": "system", "content": "ignorado"},
        {"role": "user", "content": ""},
    ],
}


def test_chat_history_mapea_solo_turnos_utiles():
    assert chat_history(None) == []
    history = chat_history(CONVERSACION_PREVIA)
    assert [(m.role, m.content) for m in history] == [
        ("user", "hola"),
        ("assistant", "buenas"),
    ]


def test_texto_reanuda_historial_y_persiste(monkeypatch):
    turn = TurnResult(
        message="respuesta del bot",
        metadata={
            "model": "deepseek-chat",
            "tokens_used": 42,
            "estimated_cost_usd": 0.0001,
        },
        llm=True,
    )
    conversations, clients, agent, notified = _install(
        monkeypatch, latest=CONVERSACION_PREVIA, result=turn
    )

    payload = asyncio.run(run_text_turn(BOT, CHANNEL, "dev-1", "¿qué trámite?"))

    # El turno recibe el historial de la conversación anterior y el canal voice.
    call = agent.calls[0]
    assert call["bot"] is BOT
    assert call["user_text"] == "¿qué trámite?"
    assert call["canal"] == "voice"
    assert call["client_id"] == "client_test"
    assert [(m.role, m.content) for m in call["history"]] == [
        ("user", "hola"),
        ("assistant", "buenas"),
    ]

    # Reutiliza la conversación existente: no crea otra.
    assert conversations.created == []
    assert [(m[0], m[1], m[2]) for m in conversations.messages] == [
        ("conv_previa", "user", "¿qué trámite?"),
        ("conv_previa", "assistant", "respuesta del bot"),
    ]
    assert conversations.messages[0][3] == {"source": "text"}
    assert conversations.messages[1][3]["source"] == "text"
    assert conversations.messages[1][3]["model"] == "deepseek-chat"
    assert conversations.messages[1][3]["tokens_used"] == 42

    assert notified[0]["channel"] == "voice"
    assert notified[0]["conversation_id"] == "conv_previa"
    assert notified[0]["client_label"] == "Vecina"
    assert notified[0]["content"] == "¿qué trámite?"
    assert clients.counters == [("client_test", {"messages": 1})]

    assert payload == {
        "conversation_id": "conv_previa",
        "device_id": "dev-1",
        "reply": "respuesta del bot",
        "model": "deepseek-chat",
        "tokens_used": 42,
        "estimated_cost_usd": 0.0001,
    }


def test_texto_crea_conversacion_si_no_hay_historial(monkeypatch):
    conversations, _clients, agent, _notified = _install(
        monkeypatch,
        latest=None,
        result=TurnResult(message="hola", metadata={"model": "m"}, llm=True),
    )

    payload = asyncio.run(run_text_turn(BOT, CHANNEL, "dev-2", "primer mensaje"))

    assert conversations.created == [
        {
            "user_id": "dev-2",
            "metadata": {
                "source": "text",
                "channel_id": "channel_test",
                "device_id": "dev-2",
            },
            "bot_id": "bot_test",
            "client_id": "client_test",
            "channel": "voice",
        }
    ]
    # Sin conversación previa el turno arranca sin historial.
    assert agent.calls[0]["history"] == []
    assert payload["conversation_id"] == "conv_nueva"


def test_texto_sin_proveedor_de_ia_no_persiste(monkeypatch):
    conversations, clients, _agent, notified = _install(
        monkeypatch,
        latest=CONVERSACION_PREVIA,
        result=TurnResult(message=None, metadata={"llm_error": "not_configured"}),
    )

    with pytest.raises(TextTurnError):
        asyncio.run(run_text_turn(BOT, CHANNEL, "dev-3", "hola"))

    assert conversations.messages == []
    assert clients.counters == []
    assert notified == []


def test_router_recorta_el_mensaje_y_llama_al_turno(monkeypatch):
    llamadas = []

    async def fake_turn(bot, channel, device_id, content):
        llamadas.append((bot, channel, device_id, content))
        return {"reply": "ok"}

    async def fake_channel(tenant, channel_id):
        return CHANNEL

    monkeypatch.setattr(voice_router, "_resolve_voice_channel", fake_channel)
    monkeypatch.setattr(
        voice_router, "get_bot_service", lambda: SimpleNamespace(get_bot=_get_bot)
    )
    monkeypatch.setattr(voice_router, "run_text_turn", fake_turn)

    data = voice_router.VoiceTextRequest(content="  hola  ", device_id=" dev-9 ")
    payload = asyncio.run(voice_router.send_voice_text(data, tenant=SimpleNamespace()))

    assert payload == {"reply": "ok"}
    assert llamadas == [(BOT, CHANNEL, "dev-9", "hola")]


async def _get_bot(_bot_id):
    return BOT


def test_router_rechaza_mensaje_vacio():
    data = voice_router.VoiceTextRequest(content="   ", device_id="dev-9")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(voice_router.send_voice_text(data, tenant=SimpleNamespace()))

    assert exc.value.status_code == 422


def test_router_traduce_textturnerror_a_503(monkeypatch):
    async def fake_turn(_bot, _channel, _device_id, _content):
        raise TextTurnError("sin proveedor de IA")

    async def fake_channel(tenant, channel_id):
        return CHANNEL

    monkeypatch.setattr(voice_router, "_resolve_voice_channel", fake_channel)
    monkeypatch.setattr(
        voice_router, "get_bot_service", lambda: SimpleNamespace(get_bot=_get_bot)
    )
    monkeypatch.setattr(voice_router, "run_text_turn", fake_turn)

    data = voice_router.VoiceTextRequest(content="hola")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(voice_router.send_voice_text(data, tenant=SimpleNamespace()))

    assert exc.value.status_code == 503
    assert "sin proveedor de IA" in exc.value.detail
