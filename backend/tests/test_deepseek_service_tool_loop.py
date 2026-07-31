"""
Regresión: si el modelo agota las 3 vueltas de tool-calling sin producir
texto plano, sync_generate ya no debe devolver "response": "" -- eso hacía
que el usuario recibiera un mensaje vacío y el chat pareciera colgado (bug
reportado en producción con LLM_PROVIDER=deepseek, el proveedor real de
gestion.ar). No pega a la red real: mockea httpx.Client.
"""

from unittest.mock import MagicMock, patch

import pytest

from app.deepseek_service import DeepSeekService


def _tool_call_response(call_id: str = "call_1") -> dict:
    return {
        "choices": [{
            "message": {
                "role": "assistant",
                "content": None,
                "tool_calls": [{
                    "id": call_id,
                    "function": {"name": "iniciar_reserva_turno", "arguments": "{}"},
                }],
            }
        }],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5},
    }


def _text_response(content: str) -> dict:
    return {
        "choices": [{"message": {"role": "assistant", "content": content, "tool_calls": None}}],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5},
    }


def _fake_client_returning(responses: list[dict]):
    """Doble de httpx.Client cuyo .post(...) devuelve las respuestas dadas en orden."""
    calls = {"count": 0}

    def _post(*args, **kwargs):
        idx = min(calls["count"], len(responses) - 1)
        calls["count"] += 1
        resp = MagicMock()
        resp.is_error = False
        resp.json.return_value = responses[idx]
        return resp

    fake_client = MagicMock()
    fake_client.__enter__.return_value = fake_client
    fake_client.__exit__.return_value = False
    fake_client.post.side_effect = _post
    return fake_client, calls


def test_exhausted_tool_loop_forces_final_plain_text_call(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    service = DeepSeekService()

    # El modelo devuelve tool_calls en las 3 rondas permitidas, y recién en
    # la 4ta llamada (forzada, sin tools) contesta en texto plano.
    responses = [
        _tool_call_response("call_1"),
        _tool_call_response("call_2"),
        _tool_call_response("call_3"),
        _text_response("Perfecto, te anoto para la semana que viene por la mañana."),
    ]
    fake_client, calls = _fake_client_returning(responses)

    with patch("app.deepseek_service.httpx.Client", return_value=fake_client):
        result = service.sync_generate(
            system_prompt="sys",
            messages=[{"role": "user", "content": "la semana que viene, a la mañana o a la tarde"}],
            max_tokens=200,
            tools=[{"name": "iniciar_reserva_turno", "description": "d", "parameters": {"type": "object", "properties": {}}}],
            tool_executor=lambda name, args: {"ok": True},
        )

    assert result["response"] == "Perfecto, te anoto para la semana que viene por la mañana."
    assert calls["count"] == 4  # 3 rondas con tools + 1 llamada final forzada sin tools
    # La llamada final no debe pedir tools -- si el modelo volviera a colgarse
    # en una tool call ahí no habría ningún fallback más.
    final_call_kwargs = fake_client.post.call_args_list[-1].kwargs
    assert "tools" not in final_call_kwargs["json"]


def test_normal_tool_call_resolves_without_forcing_final_call(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-key")
    service = DeepSeekService()

    responses = [
        _tool_call_response("call_1"),
        _text_response("Listo, ya arranqué tu reserva."),
    ]
    fake_client, calls = _fake_client_returning(responses)

    with patch("app.deepseek_service.httpx.Client", return_value=fake_client):
        result = service.sync_generate(
            system_prompt="sys",
            messages=[{"role": "user", "content": "quiero agendar un turno"}],
            max_tokens=200,
            tools=[{"name": "iniciar_reserva_turno", "description": "d", "parameters": {"type": "object", "properties": {}}}],
            tool_executor=lambda name, args: {"ok": True},
        )

    assert result["response"] == "Listo, ya arranqué tu reserva."
    assert calls["count"] == 2  # se resolvió en la primera ronda, sin necesitar el fallback
