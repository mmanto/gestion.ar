"""
DeepSeek Service
Servicio para interactuar con la API oficial de DeepSeek (api.deepseek.com),
compatible con el formato de chat completions de OpenAI.
Compatible con la misma interfaz que ClaudeService/OllamaService.
"""

import os
import json
import asyncio
from datetime import datetime
from typing import Optional, List, Callable

import httpx

from app.claude_service import ChatMessage, ChatResponse


class DeepSeekService:
    """Servicio para interacciones con la API hosted de DeepSeek."""

    # Precios por millón de tokens (USD), precio de input a "cache miss" —
    # verificar contra https://api-docs.deepseek.com/quick_start/pricing antes
    # de usar para facturación real (no distinguimos cache hit/miss acá).
    #
    # 'deepseek-chat'/'deepseek-reasoner' son alias legacy que DeepSeek da de
    # baja el 2026-07-24 (hoy mapean a los modos non-thinking/thinking de
    # deepseek-v4-flash) — se mantienen como fallback de pricing solo por si
    # alguien fuerza ese DEEPSEEK_MODEL a mano, pero el default ya usa los
    # nombres vigentes.
    PRICING = {
        "deepseek-v4-flash": {"input": 0.14, "output": 0.28},
        "deepseek-v4-pro": {"input": 0.435, "output": 0.87},
        "deepseek-chat": {"input": 0.14, "output": 0.28},
        "deepseek-reasoner": {"input": 0.435, "output": 0.87},
    }

    def __init__(self):
        self.api_key = os.getenv("DEEPSEEK_API_KEY")
        self.base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
        self.model = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")
        self.timeout = float(os.getenv("DEEPSEEK_TIMEOUT", "90"))
        # "thinking" queda deshabilitado por default: si se omite, la API lo
        # habilita sola con reasoning_effort "high" y el modelo gasta el
        # presupuesto de max_tokens en razonamiento oculto antes de la
        # respuesta visible — mismo problema que vimos con el modelo
        # "thinking" de Ollama (ver ollama_service.py / bug de timeout).
        self.thinking_enabled = os.getenv("DEEPSEEK_THINKING", "disabled").lower() == "enabled"

        if not self.api_key:
            raise ValueError(
                "DEEPSEEK_API_KEY no configurada. "
                "Por favor agrega tu API key en .env.dev (o .env.prod)"
            )

        print("✅ DeepSeek Service inicializado")
        print(f"🐋 Modelo: {self.model} (thinking={'enabled' if self.thinking_enabled else 'disabled'})")
        print(f"🌐 URL: {self.base_url}")

    def calculate_cost(self, input_tokens: int, output_tokens: int) -> float:
        """Calcula el costo estimado de una llamada a la API"""
        pricing = self.PRICING.get(self.model, self.PRICING["deepseek-v4-flash"])
        input_cost = (input_tokens / 1_000_000) * pricing["input"]
        output_cost = (output_tokens / 1_000_000) * pricing["output"]
        return input_cost + output_cost

    def sync_generate(
        self,
        system_prompt: str,
        messages: list,
        max_tokens: int,
        thinking: Optional[bool] = None,
        tools: Optional[list] = None,
        tool_executor: Optional[Callable[[str, dict], dict]] = None,
    ) -> dict:
        """
        Llamada síncrona a la API de DeepSeek. Se ejecuta vía asyncio.to_thread desde los routers.
        Retorna dict compatible con ClaudeService.sync_generate/OllamaService.sync_generate.

        `thinking`: override puntual del DEEPSEEK_THINKING global (ver
        bot.config.llm_thinking) — None respeta el default del proceso.

        `tools`/`tool_executor`: soporte de tool calling (ver
        prospect_auto_qualify_service.py). `tools` viene en shape neutro
        [{name, description, parameters}] y se envuelve acá al formato
        OpenAI-style que usa DeepSeek ({"type":"function","function":...}).
        Si el modelo responde con `message.tool_calls`, se ejecuta
        `tool_executor(name, args)` por cada uno y se le devuelve el
        resultado como mensaje role="tool", repitiendo hasta que conteste
        con texto plano (tope de 3 vueltas para evitar loops).
        """
        use_thinking = self.thinking_enabled if thinking is None else thinking
        deepseek_tools = None
        if tools:
            deepseek_tools = [
                {"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["parameters"]}}
                for t in tools
            ]

        current_messages = [{"role": "system", "content": system_prompt}] + list(messages)
        total_input_tokens = 0
        total_output_tokens = 0
        headers = {"Authorization": f"Bearer {self.api_key}"}

        for _ in range(3):
            payload = {
                "model": self.model,
                "messages": current_messages,
                "max_tokens": max_tokens,
                "stream": False,
                "thinking": {"type": "enabled" if use_thinking else "disabled"},
            }
            if deepseek_tools:
                payload["tools"] = deepseek_tools

            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(f"{self.base_url}/chat/completions", json=payload, headers=headers)
                if response.is_error:
                    # response.raise_for_status() no incluye el body en el mensaje de la excepción
                    # (str(e) queda como "400 Bad Request for url: ..." sin el motivo real) — DeepSeek
                    # devuelve {"error": {"message": ..., "type": ...}} con el detalle, lo levantamos
                    # explícito para que quede en el log de web_chat_router.py en vez de tener que
                    # reproducir el request a mano para saber qué rechazó.
                    raise RuntimeError(
                        f"DeepSeek API error {response.status_code}: {response.text}"
                    )
                data = response.json()

            message = data["choices"][0]["message"]
            usage = data.get("usage", {})
            total_input_tokens += usage.get("prompt_tokens", 0)
            total_output_tokens += usage.get("completion_tokens", 0)

            tool_calls = message.get("tool_calls")
            if not tool_calls or not tool_executor:
                return {
                    "response": message.get("content") or "",
                    "tokens_used": total_input_tokens + total_output_tokens,
                    "input_tokens": total_input_tokens,
                    "output_tokens": total_output_tokens,
                    "estimated_cost_usd": self.calculate_cost(total_input_tokens, total_output_tokens),
                    "model": self.model,
                }

            current_messages.append(message)
            for call in tool_calls:
                function = call.get("function", {})
                try:
                    args = json.loads(function.get("arguments") or "{}")
                    result = tool_executor(function.get("name"), args)
                    content = json.dumps(result, ensure_ascii=False)
                except Exception as e:
                    content = f"Error ejecutando la tool: {e}"
                current_messages.append({
                    "role": "tool",
                    "tool_call_id": call.get("id"),
                    "content": content,
                })

        return {
            "response": "",
            "tokens_used": total_input_tokens + total_output_tokens,
            "input_tokens": total_input_tokens,
            "output_tokens": total_output_tokens,
            "estimated_cost_usd": self.calculate_cost(total_input_tokens, total_output_tokens),
            "model": self.model,
        }

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
        if context:
            system_prompt += f"\n\nCONTEXTO RELEVANTE:\n{context}"

        messages = []
        if conversation_history:
            for msg in conversation_history:
                messages.append({"role": msg.role, "content": msg.content})
        messages.append({"role": "user", "content": user_message})

        result = await asyncio.to_thread(
            self.sync_generate, system_prompt, messages, max_tokens, thinking, tools, tool_executor
        )

        return ChatResponse(
            response=result["response"],
            tokens_used=result["tokens_used"],
            input_tokens=result["input_tokens"],
            output_tokens=result["output_tokens"],
            estimated_cost_usd=result["estimated_cost_usd"],
            model=self.model,
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
