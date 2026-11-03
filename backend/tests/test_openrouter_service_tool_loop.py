"""
Contrato de `OpenRouterService.sync_generate` (ADR-038), espejo de
test_deepseek_service_tool_loop.py: mismo loop de tool calling con el mismo
fallback (si se agotan las 3 vueltas sin texto plano, una última llamada SIN
tools), más lo propio de OpenRouter: costo real por respuesta (`usage.cost`) y
`reasoning` opt-in.

No pega a la red real: mockea `httpx.Client`.
"""

from unittest.mock import MagicMock, patch

import pytest

from app.llm_errors import LLMProviderError
from app.openrouter_service import OpenRouterService


def _service(**kwargs) -> OpenRouterService:
    return OpenRouterService(
        api_key="sk-or-v1-test",
        model="deepseek/deepseek-chat",
        base_url="https://openrouter.test/api/v1",
        **kwargs,
    )


def _tool_call_response(call_id: str = "call_1", cost: float = 0.001) -> dict:
    return {
        "model": "deepseek/deepseek-chat",
        "choices": [{
            "finish_reason": "tool_calls",
            "message": {
                "role": "assistant",
                "content": None,
                "tool_calls": [{
                    "id": call_id,
                    "type": "function",
                    "function": {"name": "iniciar_reserva_turno", "arguments": "{}"},
                }],
            },
        }],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5, "cost": cost},
    }


def _text_response(content: str, cost: float = 0.002) -> dict:
    return {
        "model": "deepseek/deepseek-chat",
        "choices": [{
            "finish_reason": "stop",
            "message": {"role": "assistant", "content": content, "tool_calls": None},
        }],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5, "cost": cost},
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


def test_normal_tool_call_resolves_without_forcing_final_call():
    service = _service()
    responses = [
        _tool_call_response("call_1", cost=0.001),
        _text_response("Listo, ya arranqué tu reserva.", cost=0.002),
    ]
    fake_client, calls = _fake_client_returning(responses)

    seen_results = []

    def _executor(name: str, args: dict) -> dict:
        seen_results.append((name, args))
        return {"ok": True}

    with patch("app.openrouter_service.httpx.Client", return_value=fake_client):
        result = service.sync_generate(
            system_prompt="sys",
            messages=[{"role": "user", "content": "quiero agendar un turno"}],
            max_tokens=200,
            tools=[{
                "name": "iniciar_reserva_turno",
                "description": "d",
                "parameters": {"type": "object", "properties": {}},
            }],
            tool_executor=_executor,
        )

    assert result["response"] == "Listo, ya arranqué tu reserva."
    assert calls["count"] == 2
    assert seen_results == [("iniciar_reserva_turno", {})]
    # El costo se suma de usage.cost de cada respuesta (no se estima local).
    assert result["estimated_cost_usd"] == pytest.approx(0.003)
    assert result["tokens_used"] == 30

    # Primera llamada: tools en formato OpenAI.
    first_payload = fake_client.post.call_args_list[0].kwargs["json"]
    assert first_payload["tools"][0]["type"] == "function"
    assert first_payload["tools"][0]["function"]["name"] == "iniciar_reserva_turno"
    # Segunda llamada: el resultado de la tool viaja como role="tool".
    second_payload = fake_client.post.call_args_list[1].kwargs["json"]
    assert second_payload["messages"][-1]["role"] == "tool"
    assert second_payload["messages"][-1]["tool_call_id"] == "call_1"


def test_exhausted_tool_loop_forces_final_plain_text_call():
    service = _service()
    responses = [
        _tool_call_response("call_1"),
        _tool_call_response("call_2"),
        _tool_call_response("call_3"),
        _text_response("Perfecto, te anoto para la semana que viene por la mañana."),
    ]
    fake_client, calls = _fake_client_returning(responses)

    with patch("app.openrouter_service.httpx.Client", return_value=fake_client):
        result = service.sync_generate(
            system_prompt="sys",
            messages=[{"role": "user", "content": "la semana que viene, a la mañana o a la tarde"}],
            max_tokens=200,
            tools=[{
                "name": "iniciar_reserva_turno",
                "description": "d",
                "parameters": {"type": "object", "properties": {}},
            }],
            tool_executor=lambda name, args: {"ok": True},
        )

    assert result["response"] == "Perfecto, te anoto para la semana que viene por la mañana."
    assert calls["count"] == 4  # 3 rondas con tools + 1 llamada final sin tools
    final_payload = fake_client.post.call_args_list[-1].kwargs["json"]
    assert "tools" not in final_payload


def test_thinking_adds_reasoning_only_when_enabled():
    service = _service()
    fake_client, _calls = _fake_client_returning([_text_response("ok")])

    with patch("app.openrouter_service.httpx.Client", return_value=fake_client):
        service.sync_generate("sys", [{"role": "user", "content": "hola"}], 100, thinking=True)

    payload = fake_client.post.call_args_list[-1].kwargs["json"]
    assert payload["reasoning"] == {"enabled": True}

    fake_client2, _calls2 = _fake_client_returning([_text_response("ok")])
    with patch("app.openrouter_service.httpx.Client", return_value=fake_client2):
        service.sync_generate("sys", [{"role": "user", "content": "hola"}], 100)

    payload2 = fake_client2.post.call_args_list[-1].kwargs["json"]
    assert "reasoning" not in payload2


def test_http_error_is_wrapped_with_provider_message():
    service = _service()
    fake_client = MagicMock()
    fake_client.__enter__.return_value = fake_client
    fake_client.__exit__.return_value = False
    resp = MagicMock()
    resp.is_error = True
    resp.status_code = 401
    resp.json.return_value = {"error": {"message": "No auth credentials found"}}
    fake_client.post.return_value = resp

    with patch("app.openrouter_service.httpx.Client", return_value=fake_client):
        with pytest.raises(LLMProviderError) as exc:
            service.sync_generate("sys", [{"role": "user", "content": "hola"}], 100)

    assert "401" in str(exc.value)
    assert "No auth credentials found" in str(exc.value)
    assert "sk-or-v1-test" not in str(exc.value)


def test_error_inside_choices_is_raised():
    service = _service()
    fake_client, _calls = _fake_client_returning([{
        "model": "deepseek/deepseek-chat",
        "choices": [{"error": {"message": "upstream provider unavailable"}}],
        "usage": {},
    }])

    with patch("app.openrouter_service.httpx.Client", return_value=fake_client):
        with pytest.raises(LLMProviderError) as exc:
            service.sync_generate("sys", [{"role": "user", "content": "hola"}], 100)

    assert "upstream provider unavailable" in str(exc.value)


def test_attribution_headers_only_when_configured():
    service = _service(app_url="https://ius.example", app_title="IUS")
    fake_client, _calls = _fake_client_returning([_text_response("ok")])

    with patch("app.openrouter_service.httpx.Client", return_value=fake_client):
        service.sync_generate("sys", [{"role": "user", "content": "hola"}], 100)

    headers = fake_client.post.call_args_list[-1].kwargs["headers"]
    assert headers["HTTP-Referer"] == "https://ius.example"
    assert headers["X-OpenRouter-Title"] == "IUS"
    assert headers["Authorization"] == "Bearer sk-or-v1-test"

    bare = _service(app_url="", app_title="")
    fake_client2, _calls2 = _fake_client_returning([_text_response("ok")])
    with patch("app.openrouter_service.httpx.Client", return_value=fake_client2):
        bare.sync_generate("sys", [{"role": "user", "content": "hola"}], 100)

    headers2 = fake_client2.post.call_args_list[-1].kwargs["headers"]
    assert "HTTP-Referer" not in headers2
    assert "X-OpenRouter-Title" not in headers2
