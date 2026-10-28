"""Tests del puente WS cliente ↔ Deepgram (`voice_router._bridge`).

No abren sockets reales: un `dg` falso entrega los frames del protocolo y un
`websocket` falso registra lo que se reenvía. Validan lo que no cubre el test de
`Settings`: `Welcome` → `Settings`, `FunctionCallRequest` → `FunctionCallResponse`
y la persistencia/notificación de cada `ConversationText`.
"""

import asyncio
import json
from types import SimpleNamespace

from app.routers import voice_router
from app.routers.voice_router import _bridge


class FakeWebSocket:
    def __init__(self):
        self.frames = []
        self.bytes_sent = []
        self._recv = asyncio.Event()

    async def send_json(self, data):
        self.frames.append(data)

    async def send_bytes(self, data):
        self.bytes_sent.append(data)

    async def receive(self):
        await self._recv.wait()
        return {"type": "websocket.disconnect", "code": 1000}


class FakeDeepgram:
    def __init__(self, messages):
        self._messages = list(messages)
        self.sent = []
        self.closed = False

    async def send(self, data):
        self.sent.append(json.loads(data) if isinstance(data, str) else data)

    def __aiter__(self):
        return self

    async def __anext__(self):
        if not self._messages:
            raise StopAsyncIteration
        return self._messages.pop(0)

    async def close(self):
        self.closed = True


class FakeConversations:
    def __init__(self):
        self.messages = []

    async def add_message(self, conversation_id, role, content, metadata=None):
        self.messages.append((conversation_id, role, content, metadata or {}))


def test_bridge_translates_protocol_and_persists(monkeypatch):
    notified = []

    async def fake_notify(**kwargs):
        notified.append(kwargs)

    class FakeClients:
        async def increment_counters(self, client_id, **kwargs):
            return None

    monkeypatch.setattr(voice_router, "notify_staff_of_client_message", fake_notify)
    monkeypatch.setattr(voice_router, "get_client_service", lambda: FakeClients())

    dg = FakeDeepgram(
        [
            json.dumps({"type": "Welcome"}),
            json.dumps(
                {
                    "type": "FunctionCallRequest",
                    "functions": [
                        {
                            "id": "fn-1",
                            "name": "registrar_calificacion_prospecto",
                            "arguments": '{"color": "verde"}',
                            "client_side": True,
                        },
                        {
                            "id": "fn-2",
                            "name": "server_tool",
                            "arguments": "{}",
                            "client_side": False,
                        },
                    ],
                }
            ),
            json.dumps({"type": "ConversationText", "role": "user", "content": "hola"}),
            json.dumps({"type": "ConversationText", "role": "assistant", "content": "buenas"}),
            json.dumps({"type": "AgentAudioDone"}),
        ]
    )
    ws = FakeWebSocket()
    conversations = FakeConversations()
    client = SimpleNamespace(
        bot_id="bot_test", client_id="client_test", name="Vecino"
    )

    asyncio.run(
        _bridge(
            ws,
            dg,
            {"type": "Settings"},
            lambda name, args: {"ok": name},
            conversations,
            client,
            "conv_test",
        )
    )

    # Welcome → Settings del servidor (el cliente no lo manda).
    assert dg.sent[0] == {"type": "Settings"}
    # Solo la función client_side recibe respuesta.
    responses = [m for m in dg.sent if m.get("type") == "FunctionCallResponse"]
    assert responses == [
        {
            "type": "FunctionCallResponse",
            "id": "fn-1",
            "name": "registrar_calificacion_prospecto",
            "content": '{"ok": "registrar_calificacion_prospecto"}',
        }
    ]
    # Los ConversationText se persisten y se reenvían tal cual.
    assert [(m[1], m[2]) for m in conversations.messages] == [
        ("user", "hola"),
        ("assistant", "buenas"),
    ]
    assert conversations.messages[1][3]["estimated_cost_usd"] >= 0
    # FunctionCallRequest no se reenvía: lo resuelve el proxy.
    assert [f["type"] for f in ws.frames] == [
        "ConversationText",
        "ConversationText",
        "AgentAudioDone",
    ]
    assert notified[0]["content"] == "hola"
    assert notified[0]["channel"] == "voice"
