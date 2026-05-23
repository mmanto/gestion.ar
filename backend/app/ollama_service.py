"""
Ollama Service
Servicio para interactuar con modelos locales vía Ollama API.
Compatible con la misma interfaz que ClaudeService.
"""

import os
import asyncio
from datetime import datetime
from typing import Optional, List

import httpx

from app.claude_service import ChatMessage, ChatResponse


class OllamaService:
    """Servicio para modelos locales corriendo en Ollama."""

    def __init__(self):
        self.base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
        self.model = os.getenv("OLLAMA_MODEL", "qcwind/qwen3-8b-instruct-Q4-K-M:latest")
        self.timeout = float(os.getenv("OLLAMA_TIMEOUT", "120"))
        print("✅ Ollama Service inicializado")
        print(f"🦙 Modelo: {self.model}")
        print(f"🌐 URL: {self.base_url}")

    def calculate_cost(self, input_tokens: int, output_tokens: int) -> float:
        return 0.0

    def sync_generate(
        self,
        system_prompt: str,
        messages: list,
        max_tokens: int,
    ) -> dict:
        """
        Llamada síncrona a Ollama. Se ejecuta vía asyncio.to_thread desde los routers.
        """
        payload = {
            "model": self.model,
            "messages": [{"role": "system", "content": system_prompt}] + messages,
            "stream": False,
            "options": {"num_predict": max_tokens},
        }

        with httpx.Client(timeout=self.timeout) as client:
            response = client.post(f"{self.base_url}/api/chat", json=payload)
            response.raise_for_status()
            data = response.json()

        assistant_text = data["message"]["content"]
        input_tokens = data.get("prompt_eval_count", 0)
        output_tokens = data.get("eval_count", 0)

        return {
            "response": assistant_text,
            "tokens_used": input_tokens + output_tokens,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "estimated_cost_usd": 0.0,
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
            estimated_cost_usd=0.0,
            model=self.model,
            timestamp=datetime.utcnow().isoformat(),
            context_used=context,
        )

    async def generate_rag_response(
        self,
        user_message: str,
        rag_context: str,
        max_tokens: int = 1024,
    ) -> ChatResponse:
        return await self.generate_response(
            user_message=user_message,
            context=rag_context,
            max_tokens=max_tokens,
        )
