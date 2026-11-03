"""
OpenRouter Service
Tercer proveedor de LLM (ADR-038), además de Claude y DeepSeek. OpenRouter
expone la API OpenAI-compatible en `OPENROUTER_BASE_URL` y enruta a cualquier
modelo (`deepseek/deepseek-chat`, `anthropic/claude-…`, …), así que la key es
siempre del tenant: no existe una key de plataforma ni un OpenRouter global en
`get_llm_service()`.

Compatible con la misma interfaz que ClaudeService/DeepSeekService/OllamaService
(`sync_generate` + `generate_response` + `generate_rag_response`).

Diferencias con DeepSeek que importan acá:
- El costo real viene por respuesta en `usage.cost` (USD) — se suma en lugar de
  estimarse con una tabla de precios local.
- `reasoning` es opt-in por request (`{"enabled": true}`) y sólo si
  `bot.config.llm_thinking` está prendido.
- Los errores de ruteo/upstream pueden venir como HTTP 200 con
  `choices[0].error` en vez de un status de error.
"""

import asyncio
import json
import os
from datetime import datetime
from typing import Callable, List, Optional

import httpx

from app.claude_service import ChatMessage, ChatResponse, build_user_message_with_context
from app.llm_errors import LLMProviderError

DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_TIMEOUT = 90.0


def _error_message(response: httpx.Response) -> str:
    """Mensaje del proveedor (`{"error": {"message": ...}}`) o el body crudo.

    Nunca incluye headers: el `Authorization` con la key del tenant viaja ahí.
    """
    try:
        payload = response.json()
    except ValueError:
        return (response.text or "").strip()[:500] or "sin detalle"
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict) and error.get("message"):
            return str(error["message"])
        if isinstance(error, str) and error:
            return error
        if payload.get("message"):
            return str(payload["message"])
    return json.dumps(payload, ensure_ascii=False)[:500]


class OpenRouterService:
    """Servicio para interacciones con OpenRouter (BYOK por tenant)."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        base_url: Optional[str] = None,
        timeout: Optional[float] = None,
        app_url: Optional[str] = None,
        app_title: Optional[str] = None,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.base_url = (
            base_url or os.getenv("OPENROUTER_BASE_URL", DEFAULT_BASE_URL)
        ).rstrip("/")
        self.timeout = float(
            timeout if timeout is not None else os.getenv("OPENROUTER_TIMEOUT", DEFAULT_TIMEOUT)
        )
        # Headers de atribución opcionales (OpenRouter los muestra en el
        # ranking de apps). Vacíos = no se mandan.
        self.app_url = app_url if app_url is not None else os.getenv("OPENROUTER_APP_URL", "")
        self.app_title = (
            app_title if app_title is not None else os.getenv("OPENROUTER_APP_TITLE", "")
        )

        if not self.api_key:
            raise ValueError("OpenRouter requiere una API key del tenant")

    def _headers(self) -> dict:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        if self.app_url.strip():
            headers["HTTP-Referer"] = self.app_url.strip()
        if self.app_title.strip():
            headers["X-OpenRouter-Title"] = self.app_title.strip()
        return headers

    def _post(self, payload: dict) -> dict:
        with httpx.Client(timeout=self.timeout) as client:
            response = client.post(
                f"{self.base_url}/chat/completions",
                json=payload,
                headers=self._headers(),
            )
        if response.is_error:
            raise LLMProviderError(
                f"OpenRouter (HTTP {response.status_code}): {_error_message(response)}"
            )
        data = response.json()

        choices = data.get("choices") or []
        first = choices[0] if choices else {}
        # OpenRouter devuelve 200 con `choices[0].error` cuando el upstream
        # falla (modelo sin proveedor disponible, moderación, …).
        choice_error = first.get("error") if isinstance(first, dict) else None
        if choice_error:
            message = (
                choice_error.get("message")
                if isinstance(choice_error, dict)
                else str(choice_error)
            ) or "error del proveedor upstream"
            raise LLMProviderError(f"OpenRouter: {message}")
        return data

    def sync_generate(
        self,
        system_prompt: str,
        messages: list,
        max_tokens: int,
        thinking: Optional[bool] = None,
        tools: Optional[list] = None,
        tool_executor: Optional[Callable[[str, dict], dict]] = None,
    ) -> dict:
        """Llamada síncrona a OpenRouter. Se ejecuta vía asyncio.to_thread.

        `tools` viene en shape neutro [{name, description, parameters}] y se
        envuelve acá al formato OpenAI (`{"type": "function", "function": …}`).
        Si la respuesta trae `finish_reason == "tool_calls"`, se ejecuta
        `tool_executor(name, args)` por cada tool call, se le devuelve el
        resultado como mensaje role="tool" y se repite (tope de 3 vueltas).
        Agotado el tope, una llamada final SIN tools para que sintetice texto —
        mismo criterio que DeepSeekService (ver el bug de respuesta vacía).
        """
        openrouter_tools = None
        if tools:
            openrouter_tools = [
                {
                    "type": "function",
                    "function": {
                        "name": t["name"],
                        "description": t["description"],
                        "parameters": t["parameters"],
                    },
                }
                for t in tools
            ]

        current_messages = [{"role": "system", "content": system_prompt}] + list(messages)
        total_input_tokens = 0
        total_output_tokens = 0
        total_cost_usd = 0.0
        used_model = self.model

        def _base_payload() -> dict:
            payload = {
                "model": self.model,
                "messages": current_messages,
                "max_tokens": max_tokens,
                "stream": False,
            }
            if thinking is True:
                payload["reasoning"] = {"enabled": True}
            return payload

        def _accumulate(data: dict) -> dict:
            nonlocal total_input_tokens, total_output_tokens, total_cost_usd, used_model
            usage = data.get("usage") or {}
            total_input_tokens += usage.get("prompt_tokens") or 0
            total_output_tokens += usage.get("completion_tokens") or 0
            total_cost_usd += usage.get("cost") or 0.0
            if data.get("model"):
                used_model = data["model"]
            return (data.get("choices") or [{}])[0].get("message") or {}

        def _result(text: str) -> dict:
            return {
                "response": text,
                "tokens_used": total_input_tokens + total_output_tokens,
                "input_tokens": total_input_tokens,
                "output_tokens": total_output_tokens,
                "estimated_cost_usd": total_cost_usd,
                "model": used_model,
            }

        for _ in range(3):
            payload = _base_payload()
            if openrouter_tools:
                payload["tools"] = openrouter_tools
            data = self._post(payload)
            message = _accumulate(data)

            tool_calls = message.get("tool_calls")
            finish_reason = (data.get("choices") or [{}])[0].get("finish_reason")
            if not tool_calls or not tool_executor or finish_reason != "tool_calls":
                return _result(message.get("content") or "")

            current_messages.append(
                {
                    "role": "assistant",
                    "content": message.get("content"),
                    "tool_calls": tool_calls,
                }
            )
            for call in tool_calls:
                function = call.get("function") or {}
                try:
                    args = json.loads(function.get("arguments") or "{}")
                    result = tool_executor(function.get("name"), args)
                    content = json.dumps(result, ensure_ascii=False)
                except Exception as exc:  # noqa: BLE001 - se devuelve al modelo
                    content = f"Error ejecutando la tool: {exc}"
                current_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.get("id"),
                        "content": content,
                    }
                )

        # Tope de vueltas agotado: última llamada sin tools para sintetizar.
        data = self._post(_base_payload())
        message = _accumulate(data)
        return _result(message.get("content") or "")

    async def generate_response(
        self,
        user_message: str,
        context: Optional[str] = None,
        system_prompt: Optional[str] = None,
        conversation_history: Optional[List[ChatMessage]] = None,
        max_tokens: int = 1024,
        thinking: Optional[bool] = None,
        tools: Optional[list] = None,
        tool_executor: Optional[Callable[[str, dict], dict]] = None,
    ) -> ChatResponse:
        if not system_prompt:
            system_prompt = "Eres un asistente virtual inteligente y servicial."

        messages = []
        if conversation_history:
            for msg in conversation_history:
                messages.append({"role": msg.role, "content": msg.content})
        # El contexto RAG viaja en el turno del usuario, no en el system prompt
        # (ver build_user_message_with_context).
        messages.append(
            {"role": "user", "content": build_user_message_with_context(user_message, context)}
        )

        result = await asyncio.to_thread(
            self.sync_generate, system_prompt, messages, max_tokens, thinking, tools, tool_executor
        )

        return ChatResponse(
            response=result["response"],
            tokens_used=result["tokens_used"],
            input_tokens=result["input_tokens"],
            output_tokens=result["output_tokens"],
            estimated_cost_usd=result["estimated_cost_usd"],
            model=result["model"],
            timestamp=datetime.utcnow().isoformat(),
            context_used=context,
        )

    async def generate_rag_response(
        self,
        user_message: str,
        rag_context: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 1024,
        thinking: Optional[bool] = None,
        tools: Optional[list] = None,
        tool_executor: Optional[Callable[[str, dict], dict]] = None,
    ) -> ChatResponse:
        return await self.generate_response(
            user_message=user_message,
            context=rag_context,
            system_prompt=system_prompt,
            max_tokens=max_tokens,
            thinking=thinking,
            tools=tools,
            tool_executor=tool_executor,
        )
