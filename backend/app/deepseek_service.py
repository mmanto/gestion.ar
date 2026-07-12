"""
DeepSeek Service
Servicio para interactuar con la API oficial de DeepSeek (api.deepseek.com),
compatible con el formato de chat completions de OpenAI.
Compatible con la misma interfaz que ClaudeService/OllamaService.
"""

import os
import asyncio
from datetime import datetime
from typing import Optional, List

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
    ) -> dict:
        """
        Llamada síncrona a la API de DeepSeek. Se ejecuta vía asyncio.to_thread desde los routers.
        Retorna dict compatible con ClaudeService.sync_generate/OllamaService.sync_generate.
        """
        payload = {
            "model": self.model,
            "messages": [{"role": "system", "content": system_prompt}] + messages,
            "max_tokens": max_tokens,
            "stream": False,
            "thinking": {"type": "enabled" if self.thinking_enabled else "disabled"},
        }
        headers = {"Authorization": f"Bearer {self.api_key}"}

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
        assistant_text = message["content"]
        usage = data.get("usage", {})
        input_tokens = usage.get("prompt_tokens", 0)
        output_tokens = usage.get("completion_tokens", 0)

        return {
            "response": assistant_text,
            "tokens_used": input_tokens + output_tokens,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "estimated_cost_usd": self.calculate_cost(input_tokens, output_tokens),
            "model": self.model,
        }

    async def generate_response(
        self,
        user_message: str,
        context: Optional[str] = None,
        system_prompt: Optional[str] = None,
        conversation_history: Optional[List[ChatMessage]] = None,
        max_tokens: int = 1024,
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

        result = await asyncio.to_thread(self.sync_generate, system_prompt, messages, max_tokens)

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
    ) -> ChatResponse:
        return await self.generate_response(
            user_message=user_message,
            context=rag_context,
            system_prompt=system_prompt,
            max_tokens=max_tokens,
        )
