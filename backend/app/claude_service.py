"""
Claude API Service
Servicio para interactuar con Claude API y generar respuestas con contexto RAG
"""

import os
import json
import asyncio
from typing import Optional, List, Callable
from datetime import datetime
from zoneinfo import ZoneInfo
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
                "Por favor agrega tu API key en .env.dev (o .env.prod)"
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
        max_tokens: int = 1024,
        thinking: Optional[bool] = None,
        tools: Optional[list] = None,
        tool_executor: Optional[Callable[[str, dict], dict]] = None,
    ) -> ChatResponse:
        """
        Genera una respuesta usando Claude API

        Args:
            user_message: Mensaje del usuario
            context: Contexto RAG (opcional)
            system_prompt: Prompt del sistema (opcional)
            conversation_history: Historial de conversación (opcional)
            max_tokens: Máximo de tokens a generar
            thinking: sin efecto en Claude — solo lo usa DeepSeekService.
                Se acepta acá para que el caller no necesite ramificar por
                proveedor (ver bot.config.llm_thinking).
            tools/tool_executor: ver sync_generate (tool calling).

        Returns:
            ChatResponse con la respuesta y metadatos
        """
        try:
            # Construir el system prompt: default o el del bot, seguido siempre
            # del contexto RAG si existe (antes se perdía el contexto cuando
            # se pasaba un system_prompt propio, ver _build_system_prompt)
            if not system_prompt:
                system_prompt = self._build_system_prompt()
            if context:
                system_prompt += (
                    "\n\nCONTEXTO RELEVANTE (información de la base de conocimiento):\n"
                    f"{context}\n\n"
                    "INSTRUCCIONES:\n"
                    "- Usa el contexto proporcionado para responder cuando sea relevante\n"
                    "- Si la información del contexto responde directamente la pregunta, úsala\n"
                    "- Si el contexto no tiene información relevante, responde basándote en tu conocimiento general\n"
                    "- Sé claro, conciso y profesional\n"
                    "- Si no estás seguro de algo, admítelo honestamente"
                )

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

            # Reusa sync_generate (incluye el loop de tool calling) en vez de
            # duplicar la llamada a la API acá; a diferencia de antes, ahora
            # corre en un thread aparte para no bloquear el event loop
            # durante la llamada de red (igual que Ollama/DeepSeekService).
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
                context_used=context
            )

        except anthropic.APIError as e:
            raise Exception(f"Error de API de Claude: {str(e)}")
        except Exception as e:
            raise Exception(f"Error al generar respuesta: {str(e)}")

    def _build_system_prompt(self) -> str:
        """
        Construye el system prompt base (genérico) para Claude, sin contexto RAG.
        El contexto RAG se agrega siempre en generate_response, sin importar
        si el system_prompt es este default o uno propio del bot.

        Returns:
            System prompt base
        """
        return """Eres un asistente virtual inteligente y servicial.
Tu objetivo es ayudar a los usuarios respondiendo sus preguntas de manera clara,
precisa y amigable."""

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
        Llamada síncrona a la API de Claude. Se ejecuta vía asyncio.to_thread.
        Retorna dict compatible con OllamaService.sync_generate.
        `thinking` no tiene efecto acá — ver DeepSeekService.sync_generate.

        `tools`/`tool_executor`: soporte de tool calling (ver
        prospect_auto_qualify_service.py). `tools` viene en shape neutro
        [{name, description, parameters}] y se convierte acá al formato de
        Anthropic (input_schema). Si el modelo responde con stop_reason
        "tool_use", se ejecuta `tool_executor(name, input)` por cada bloque
        y se le devuelve el resultado como tool_result, repitiendo hasta que
        conteste con texto plano (tope de 3 vueltas para evitar loops).
        """
        anthropic_tools = None
        if tools:
            anthropic_tools = [
                {"name": t["name"], "description": t["description"], "input_schema": t["parameters"]}
                for t in tools
            ]

        current_messages = list(messages)
        total_input_tokens = 0
        total_output_tokens = 0

        for _ in range(3):
            kwargs = {
                "model": self.model,
                "max_tokens": max_tokens,
                "system": system_prompt,
                "messages": current_messages,
            }
            if anthropic_tools:
                kwargs["tools"] = anthropic_tools

            response = self.client.messages.create(**kwargs)
            total_input_tokens += response.usage.input_tokens
            total_output_tokens += response.usage.output_tokens

            if response.stop_reason != "tool_use" or not tool_executor:
                assistant_text = "".join(
                    block.text for block in response.content if block.type == "text"
                )
                return {
                    "response": assistant_text,
                    "tokens_used": total_input_tokens + total_output_tokens,
                    "input_tokens": total_input_tokens,
                    "output_tokens": total_output_tokens,
                    "estimated_cost_usd": self.calculate_cost(total_input_tokens, total_output_tokens),
                    "model": self.model,
                }

            current_messages.append({"role": "assistant", "content": response.content})
            tool_result_blocks = []
            for block in response.content:
                if block.type != "tool_use":
                    continue
                try:
                    result = tool_executor(block.name, block.input)
                    tool_result_blocks.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result, ensure_ascii=False),
                    })
                except Exception as e:
                    tool_result_blocks.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": f"Error ejecutando la tool: {e}",
                        "is_error": True,
                    })
            current_messages.append({"role": "user", "content": tool_result_blocks})

        return {
            "response": "",
            "tokens_used": total_input_tokens + total_output_tokens,
            "input_tokens": total_input_tokens,
            "output_tokens": total_output_tokens,
            "estimated_cost_usd": self.calculate_cost(total_input_tokens, total_output_tokens),
            "model": self.model,
        }

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


def _append_custom_facts(prompt: str, custom_facts: dict) -> str:
    """Interpola los datos puntuales editables por el admin del tenant
    (ej. honorarios) al final del prompt armado por administración general.
    Soporta placeholders `{{clave}}` en el prompt; cualquier clave no
    referenciada se agrega igual como una sección final de datos vigentes."""
    if not custom_facts:
        return prompt

    result = prompt
    unused = {}
    for key, value in custom_facts.items():
        placeholder = "{{" + key + "}}"
        if placeholder in result:
            result = result.replace(placeholder, value)
        else:
            unused[key] = value

    if unused:
        facts_lines = "\n".join(f"- {k}: {v}" for k, v in unused.items())
        result += f"\n\nDatos actualizados a informar:\n{facts_lines}"

    return result


_WEEKDAYS_ES = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")
_MONTHS_ES = (
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
)


def _current_date_line() -> str:
    """Fecha/hora real (no la de entrenamiento del modelo) para que el LLM no
    asuma un año viejo al hablar de turnos u otras fechas relativas ("mañana",
    "la semana que viene"). AR hardcodeado: hoy todos los tenants son
    negocios argentinos (ver resource_tz en appointment_booking_service.py
    para el caso, distinto, de la disponibilidad real de turnos)."""
    now = datetime.now(ZoneInfo("America/Argentina/Buenos_Aires"))
    weekday = _WEEKDAYS_ES[now.weekday()]
    month = _MONTHS_ES[now.month - 1]
    return (
        f"Fecha y hora actual: {weekday} {now.day} de {month} de {now.year}, "
        f"{now.strftime('%H:%M')} (hora de Argentina). Usá siempre este dato como \"hoy\" real "
        "-- ignorá cualquier otra fecha que creas recordar de tu entrenamiento."
    )


def build_effective_system_prompt(bot_config) -> str:
    """
    Construye el system prompt efectivo para un bot.
    Si el bot tiene ius_config cargado, lo inyecta completo como JSON de configuración.
    Si system_prompt es JSON libre válido, lo convierte a texto legible.
    De lo contrario, devuelve bot_config.system_prompt tal cual.
    En todos los casos, interpola custom_facts (datos puntuales editables por
    el admin del tenant, ej. honorarios) e informa la fecha/hora real al final.
    """
    custom_facts = getattr(bot_config, "custom_facts", None) or {}

    ius = bot_config.ius_config
    if ius:
        import json as _json
        prompt = (
            "Eres IUS, un asistente de IA legal laboral. "
            "Lee el JSON de configuración completo antes de responder y sigue estrictamente "
            "el orden de ejecución definido en HOW_TO_USE.\n"
            "IMPORTANTE: Responde siempre en texto plano. "
            "No uses Markdown: sin asteriscos (**), sin almohadillas (#), sin guiones bajos (_). "
            "Usa saltos de línea simples para separar párrafos.\n\n"
            + _json.dumps(ius, ensure_ascii=False, indent=2)
        )
        result = _append_custom_facts(prompt, custom_facts)
    else:
        raw = bot_config.system_prompt
        try:
            import json as _json
            parsed = _json.loads(raw)
            if isinstance(parsed, (dict, list)):
                result = _append_custom_facts(_json_to_text(parsed), custom_facts)
            else:
                result = _append_custom_facts(raw, custom_facts)
        except (ValueError, TypeError):
            result = _append_custom_facts(raw, custom_facts)

    return f"{result}\n\n{_current_date_line()}"


def get_effective_welcome_message(bot_config) -> str:
    """
    Retorna el mensaje de bienvenida efectivo para un bot.
    Si hay ius_config cargado, busca el saludo en dos esquemas conocidos:
    agent_identity.presentacion (docs/ius_system_prompt.json) o, si no está,
    flow[0].msg (el "flow" es un campo propio del JSON de ius_config, no
    confundir con bot_config.flow / FlowConfig). De lo contrario, retorna
    bot_config.welcome_message.
    """
    ius = bot_config.ius_config
    if ius:
        identity = ius.get("agent_identity", {})
        msg = identity.get("presentacion", "")
        if msg:
            return msg

        ius_flow = ius.get("flow")
        if isinstance(ius_flow, list) and ius_flow:
            first_step = ius_flow[0]
            if isinstance(first_step, dict):
                msg = first_step.get("msg", "")
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
      - 'claude'    → ClaudeService (Anthropic API, por defecto)
      - 'ollama'    → OllamaService (modelo local)
      - 'deepseek'  → DeepSeekService (API hosted de DeepSeek)
    """
    global _llm_service
    if _llm_service is None:
        provider = os.getenv("LLM_PROVIDER", "claude").lower()
        if provider == "ollama":
            from app.ollama_service import OllamaService
            _llm_service = OllamaService()
        elif provider == "deepseek":
            from app.deepseek_service import DeepSeekService
            _llm_service = DeepSeekService()
        else:
            _llm_service = get_claude_service()
    return _llm_service
