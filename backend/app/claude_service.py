"""
Claude API Service
Servicio para interactuar con Claude API y generar respuestas con contexto RAG
"""

import os
from typing import Optional, List
from datetime import datetime
import anthropic
from anthropic import Anthropic
from pydantic import BaseModel


class ChatMessage(BaseModel):
    """Modelo para mensajes de chat"""
    role: str
    content: str


class ChatResponse(BaseModel):
    """Modelo para respuestas de chat"""
    response: str
    tokens_used: int
    input_tokens: int
    output_tokens: int
    estimated_cost_usd: float
    model: str
    timestamp: str
    context_used: Optional[str] = None


class ClaudeService:
    """Servicio para interacciones con Claude API"""

    # Precios por millón de tokens (USD) - Claude 3.5 Sonnet
    PRICING = {
        "claude-sonnet-4-6": {
            "input": 3.00,
            "output": 15.00
        },
        "claude-opus-4-6": {
            "input": 15.00,
            "output": 75.00
        },
        "claude-haiku-4-5-20251001": {
            "input": 0.80,
            "output": 4.00
        },
        # legacy aliases
        "claude-3-5-sonnet-20241022": {
            "input": 3.00,
            "output": 15.00
        },
    }

    def __init__(self):
        """Inicializa el servicio de Claude"""
        self.api_key = os.getenv("ANTHROPIC_API_KEY")
        self.model = os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-20241022")

        if not self.api_key or self.api_key == "sk-ant-api03-YOUR_API_KEY_HERE":
            raise ValueError(
                "ANTHROPIC_API_KEY no configurada. "
                "Por favor agrega tu API key en backend/.env"
            )

        self.client = Anthropic(api_key=self.api_key)
        print("✅ Claude Service inicializado")
        print(f"📱 Modelo: {self.model}")

    def calculate_cost(self, input_tokens: int, output_tokens: int) -> float:
        """
        Calcula el costo estimado de una llamada a la API

        Args:
            input_tokens: Número de tokens de entrada
            output_tokens: Número de tokens de salida

        Returns:
            Costo en USD
        """
        pricing = self.PRICING.get(self.model, self.PRICING["claude-3-5-sonnet-20241022"])

        input_cost = (input_tokens / 1_000_000) * pricing["input"]
        output_cost = (output_tokens / 1_000_000) * pricing["output"]

        return input_cost + output_cost

    async def generate_response(
        self,
        user_message: str,
        context: Optional[str] = None,
        system_prompt: Optional[str] = None,
        conversation_history: Optional[List[ChatMessage]] = None,
        max_tokens: int = 1024
    ) -> ChatResponse:
        """
        Genera una respuesta usando Claude API

        Args:
            user_message: Mensaje del usuario
            context: Contexto RAG (opcional)
            system_prompt: Prompt del sistema (opcional)
            conversation_history: Historial de conversación (opcional)
            max_tokens: Máximo de tokens a generar

        Returns:
            ChatResponse con la respuesta y metadatos
        """
        try:
            # Construir el system prompt
            if not system_prompt:
                system_prompt = self._build_system_prompt(context)

            # Construir mensajes
            messages = []

            # Agregar historial de conversación si existe
            if conversation_history:
                for msg in conversation_history:
                    messages.append({
                        "role": msg.role,
                        "content": msg.content
                    })

            # Agregar mensaje del usuario
            messages.append({
                "role": "user",
                "content": user_message
            })

            # Llamar a la API de Claude
            response = self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                system=system_prompt,
                messages=messages
            )

            # Extraer respuesta
            assistant_message = response.content[0].text

            # Calcular tokens y costo
            input_tokens = response.usage.input_tokens
            output_tokens = response.usage.output_tokens
            total_tokens = input_tokens + output_tokens
            estimated_cost = self.calculate_cost(input_tokens, output_tokens)

            return ChatResponse(
                response=assistant_message,
                tokens_used=total_tokens,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                estimated_cost_usd=estimated_cost,
                model=self.model,
                timestamp=datetime.utcnow().isoformat(),
                context_used=context
            )

        except anthropic.APIError as e:
            raise Exception(f"Error de API de Claude: {str(e)}")
        except Exception as e:
            raise Exception(f"Error al generar respuesta: {str(e)}")

    def _build_system_prompt(self, context: Optional[str] = None) -> str:
        """
        Construye el system prompt para Claude

        Args:
            context: Contexto RAG (opcional)

        Returns:
            System prompt completo
        """
        base_prompt = """Eres un asistente virtual inteligente y servicial.
Tu objetivo es ayudar a los usuarios respondiendo sus preguntas de manera clara,
precisa y amigable."""

        if context:
            base_prompt += f"""

CONTEXTO RELEVANTE (información de la base de conocimiento):
{context}

INSTRUCCIONES:
- Usa el contexto proporcionado para responder cuando sea relevante
- Si la información del contexto responde directamente la pregunta, úsala
- Si el contexto no tiene información relevante, responde basándote en tu conocimiento general
- Sé claro, conciso y profesional
- Si no estás seguro de algo, admítelo honestamente
"""

        return base_prompt

    def sync_generate(
        self,
        system_prompt: str,
        messages: list,
        max_tokens: int,
    ) -> dict:
        """
        Llamada síncrona a la API de Claude. Se ejecuta vía asyncio.to_thread.
        Retorna dict compatible con OllamaService.sync_generate.
        """
        response = self.client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=messages,
        )
        assistant_text = response.content[0].text
        input_tokens = response.usage.input_tokens
        output_tokens = response.usage.output_tokens
        return {
            "response": assistant_text,
            "tokens_used": input_tokens + output_tokens,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "estimated_cost_usd": self.calculate_cost(input_tokens, output_tokens),
            "model": self.model,
        }

    async def generate_rag_response(
        self,
        user_message: str,
        rag_context: str,
        max_tokens: int = 1024
    ) -> ChatResponse:
        return await self.generate_response(
            user_message=user_message,
            context=rag_context,
            max_tokens=max_tokens
        )


def _json_to_text(obj, indent: int = 0) -> str:
    """Convierte un dict/list JSON a texto legible para el LLM."""
    import json as _json
    lines: list[str] = []
    prefix = "  " * indent
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, (dict, list)):
                lines.append(f"{prefix}{k}:")
                lines.append(_json_to_text(v, indent + 1))
            else:
                lines.append(f"{prefix}{k}: {v}")
    elif isinstance(obj, list):
        for item in obj:
            if isinstance(item, (dict, list)):
                lines.append(_json_to_text(item, indent))
            else:
                lines.append(f"{prefix}- {item}")
    else:
        lines.append(f"{prefix}{obj}")
    return "\n".join(lines)


def build_effective_system_prompt(bot_config) -> str:
    """
    Construye el system prompt efectivo para un bot.
    Si el bot tiene ius_config cargado, lo inyecta completo como JSON de configuración.
    Si system_prompt es JSON libre válido, lo convierte a texto legible.
    De lo contrario, devuelve bot_config.system_prompt tal cual.
    """
    ius = bot_config.ius_config
    if ius:
        import json as _json
        return (
            "Eres IUS, un asistente de IA legal laboral. "
            "Lee el JSON de configuración completo antes de responder y sigue estrictamente "
            "el orden de ejecución definido en HOW_TO_USE.\n"
            "IMPORTANTE: Responde siempre en texto plano. "
            "No uses Markdown: sin asteriscos (**), sin almohadillas (#), sin guiones bajos (_). "
            "Usa saltos de línea simples para separar párrafos.\n\n"
            + _json.dumps(ius, ensure_ascii=False, indent=2)
        )

    raw = bot_config.system_prompt
    try:
        import json as _json
        parsed = _json.loads(raw)
        if isinstance(parsed, (dict, list)):
            return _json_to_text(parsed)
    except (ValueError, TypeError):
        pass
    return raw


def get_effective_welcome_message(bot_config) -> str:
    """
    Retorna el mensaje de bienvenida efectivo para un bot.
    Si hay ius_config cargado, usa agent_identity.presentacion como bienvenida.
    De lo contrario, retorna bot_config.welcome_message.
    """
    ius = bot_config.ius_config
    if ius:
        identity = ius.get("agent_identity", {})
        msg = identity.get("presentacion", "")
        if msg:
            return msg
    return bot_config.welcome_message


# Instancia global del servicio
_claude_service: Optional[ClaudeService] = None


def get_claude_service() -> ClaudeService:
    global _claude_service
    if _claude_service is None:
        _claude_service = ClaudeService()
    return _claude_service


# ── Factory multi-proveedor ──────────────────────────────────────────────────

_llm_service = None


def get_llm_service():
    """
    Retorna el servicio LLM activo según LLM_PROVIDER:
      - 'claude'  → ClaudeService (Anthropic API, por defecto)
      - 'ollama'  → OllamaService (modelo local)
    """
    global _llm_service
    if _llm_service is None:
        provider = os.getenv("LLM_PROVIDER", "claude").lower()
        if provider == "ollama":
            from app.ollama_service import OllamaService
            _llm_service = OllamaService()
        else:
            _llm_service = get_claude_service()
    return _llm_service
