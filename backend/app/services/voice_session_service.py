"""
Voice Session Service - traducción gestion.ar → Deepgram Agent API.

El backend es dueño de la `Settings` (prompt, tools, LLM, voz) y de la API key
de Deepgram; el cliente solo transporta PCM. Ver CANAL_DE_VOZ_DEEPGRAM_PLAN.md
y ADR-034.

Decisiones:
- `VOICE_THINK=auto` mapea `LLM_PROVIDER`; `ollama`/desconocidos caen al LLM
  gestionado por Deepgram (que no puede alcanzar `localhost`).
- Con LLM gestionado el prompt tiene un tope (`MANAGED_PROMPT_LIMIT`); con BYO
  (deepseek/claude) no.
- Las tools son las contribuciones *sin estado* de `AgentService.build_tools`
  (calificación por semáforo + fuentes públicas) más RAG si `bot.config.use_rag`.
  Los interceptores pre-LLM y los widgets de módulos no aplican al canal de voz.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
from typing import Callable, Optional

from app.claude_service import (
    build_effective_system_prompt,
    get_effective_welcome_message,
)
from app.rag_service import get_rag_service
from app.services.agent_service import get_agent_service
from app.services.prospect_auto_qualify_service import QUALIFICATION_TOOL_NAME

DEEPGRAM_WS_URL = "wss://agent.deepgram.com/v1/agent/converse"
MANAGED_PROMPT_LIMIT = 25_000  # chars, límite de Deepgram con LLM gestionado
DEFAULT_MANAGED_LLM = "gpt-4o-mini"
RAG_TOOL_NAME = "buscar_conocimiento"
DEFER_UNTIL_EOT = {QUALIFICATION_TOOL_NAME}  # escribe en la DB
_TOOL_NAME_RE = re.compile(r"[A-Za-z0-9_-]{1,64}")


class VoiceConfigError(RuntimeError):
    """Configuración de voz inválida (falta key o prompt demasiado largo)."""


VOICE_STYLE_SUFFIX = (
    "\n\nEstás en una conversación de VOZ: responde en una o dos frases cortas, "
    "en el mismo idioma del usuario, sin markdown, sin listas ni emojis, y sin leer "
    "URLs en voz alta (decí que el enlace está en el chat)."
)


def build_voice_prompt(bot) -> str:
    """Prompt del bot + restricciones de estilo para voz."""
    return build_effective_system_prompt(bot.config) + VOICE_STYLE_SUFFIX


def build_think() -> dict:
    """Bloque `agent.think` de la Settings (provider + endpoint BYO o gestionado)."""
    mode = os.getenv("VOICE_THINK", "auto").strip().lower()
    if mode == "auto":
        provider = os.getenv("LLM_PROVIDER", "claude").strip().lower()
        mode = provider if provider in ("claude", "deepseek") else "managed"

    if mode == "deepseek":
        key = os.getenv("DEEPSEEK_API_KEY", "").strip()
        if not key:
            raise VoiceConfigError("DEEPSEEK_API_KEY no configurada para voz")
        base = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
        return {
            "provider": {
                "type": "open_ai",
                "model": os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash"),
            },
            "endpoint": {
                "url": f"{base}/chat/completions",
                "headers": {"authorization": f"Bearer {key}"},
            },
        }

    if mode == "claude":
        key = (os.getenv("CLAUDE_API_KEY") or os.getenv("ANTHROPIC_API_KEY") or "").strip()
        if not key:
            raise VoiceConfigError("CLAUDE_API_KEY no configurada para voz")
        return {
            "provider": {
                "type": "anthropic",
                "model": os.getenv("CLAUDE_MODEL", "claude-sonnet-4-5"),
            },
            "endpoint": {
                "url": "https://api.anthropic.com/v1/messages",
                "headers": {"x-api-key": key, "anthropic-version": "2023-06-01"},
            },
        }

    # LLM gestionado por Deepgram: sin endpoint ni key propia.
    return {
        "provider": {
            "type": "open_ai",
            "model": os.getenv("VOICE_FALLBACK_LLM", DEFAULT_MANAGED_LLM),
        }
    }


def build_voice_settings(bot, channel, history: list[dict], functions: list[dict]) -> dict:
    """`Settings` completo que se envía a Deepgram tras el `Welcome`."""
    from app.models.channel import VoiceConfig

    voice = channel.voice_config or VoiceConfig()
    prompt = build_voice_prompt(bot)
    think = build_think()
    if "endpoint" not in think and len(prompt) > MANAGED_PROMPT_LIMIT:
        raise VoiceConfigError(
            f"El prompt del bot ({len(prompt)} chars) supera el límite gestionado; "
            "configurá VOICE_THINK=claude|deepseek"
        )

    agent: dict = {
        "greeting": get_effective_welcome_message(bot.config),
        "listen": {
            "provider": {
                "type": "deepgram",
                "model": voice.listen_model,
                "language": voice.language,
                "smart_format": True,
            }
        },
        "think": {**think, "prompt": prompt, "functions": functions},
        "speak": {"provider": {"type": "deepgram", "model": voice.voice_model}},
    }
    if history:
        agent["context"] = {"messages": history}

    return {
        "type": "Settings",
        "audio": {
            "input": {"encoding": "linear16", "sample_rate": 16000},
            "output": {"encoding": "linear16", "sample_rate": 24000, "container": "none"},
        },
        "agent": agent,
    }


async def build_voice_functions(
    bot, client, client_id: Optional[str]
) -> tuple[list[dict], Callable[[str, dict], dict]]:
    """Specs para `think.functions` + dispatcher combinado.

    El dispatcher devuelve dicts JSON-serializables; el router los convierte a
    string para `FunctionCallResponse`.
    """
    tools, dispatch = await get_agent_service().build_tools(
        bot, client, client_id, "voice", None, []
    )
    tools = list(tools or [])
    executors: dict[str, Callable[[str, dict], dict]] = {}
    # `build_tools` ya devolvió un dispatcher cerrado sobre sus ejecutores;
    # se usa como fallback y el RAG se agrega aparte.
    builtin_dispatch = dispatch

    if bot is not None and getattr(bot.config, "use_rag", False):
        tools.append(
            {
                "name": RAG_TOOL_NAME,
                "description": (
                    "Busca en la base de conocimiento del negocio (documentos, normas, "
                    "precios, requisitos). Llamala antes de responder preguntas factuales."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "consulta": {"type": "string", "description": "Búsqueda"}
                    },
                    "required": ["consulta"],
                },
            }
        )

        def _rag(_name: str, args: dict) -> dict:
            consulta = (args.get("consulta") or "").strip()
            if not consulta:
                return {"error": "Consulta vacía"}
            ctx = get_rag_service().get_context(
                consulta,
                bot_id=bot.bot_id,
                n_results=bot.config.rag_results_count,
            )
            return {"resultado": ctx} if ctx else {
                "resultado": "No hay información cargada sobre eso."
            }

        executors[RAG_TOOL_NAME] = _rag

    # Wire format de Deepgram: nombre válido y `defer_until_eot` solo donde
    # importa (el agente retiene el turno hasta la respuesta).
    wire: list[dict] = []
    names: set[str] = set()
    for tool in tools:
        name = tool.get("name", "")
        if not _TOOL_NAME_RE.fullmatch(name):
            raise VoiceConfigError(f"Nombre de tool inválido para Deepgram: {name!r}")
        if name in names:
            continue
        names.add(name)
        wire.append({**tool, "defer_until_eot": name in DEFER_UNTIL_EOT})

    def _combined(tool_name: str, args: dict) -> dict:
        executor = executors.get(tool_name)
        if executor is not None:
            return executor(tool_name, args)
        if builtin_dispatch is not None:
            return builtin_dispatch(tool_name, args)
        return {"error": f"Tool desconocida: {tool_name}"}

    return wire, _combined


async def execute_function(
    dispatch: Callable[[str, dict], dict], name: str, args: dict
) -> str:
    """Ejecuta una tool fuera del event loop y serializa el resultado."""
    result = await asyncio.to_thread(dispatch, name, args)
    return json.dumps(result, ensure_ascii=False)


def history_messages(conversation: Optional[dict], limit: int = 20) -> list[dict]:
    """Últimos turnos de la conversación en el formato `History` de Deepgram."""
    if not conversation:
        return []
    messages = conversation.get("messages") or []
    return [
        {"type": "History", "role": m.get("role", "user"), "content": m.get("content", "")}
        for m in messages[-limit:]
        if m.get("role") in ("user", "assistant") and m.get("content")
    ]
