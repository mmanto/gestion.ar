"""
Runtime del agente (ver app/modules/manifest.py).

Antes cada entrada de canal (los dos WebSockets de web_chat_router, el webhook
de WhatsApp y los handlers de Telegram) repetía la misma secuencia
flow/booking → RAG → tools → LLM. Ese turno vive acá (`AgentService.run_turn`) y
las contribuciones de los módulos (tools/startup/interceptor, declaradas en el
manifiesto) se resuelven desde `app/modules/agent_runtime.py` en vez de estar
hardcodeadas en cada router.

Las contribuciones que NO son de un módulo conectable siguen acá, porque son del
agente: calificación por semáforo y consulta de fuentes públicas oficiales.

Los módulos que aportan extensiones de chat mantienen su estado por sesión en un
namespace propio (`session[module_key]`), que el canal crea y pasa en cada turno
— así un canal sin sesión persistente (WhatsApp/Telegram) recibe sólo las
contribuciones sin estado.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional

from app.claude_service import ChatMessage, build_effective_system_prompt, get_llm_service
from app.modules.agent_runtime import enabled_chat_extensions, resolve_callable
from app.modules.manifest import ChatContribution
from app.rag_service import get_rag_service
from app.services.module_service import get_module_service
from app.services.prospect_auto_qualify_service import (
    QUALIFICATION_TOOL_NAME,
    QUALIFICATION_TOOL_SPEC,
    build_qualification_tool_executor,
)
from app.services.public_sources_service import build_public_sources_tools

DEFAULT_MAX_TOKENS = 1024


@dataclass
class TurnResult:
    """Resultado de un turno del agente.

    - `message` puede ser None cuando una extensión interceptó el turno sin nada
      que responder (caso degenerado): el canal no debe enviar nada en ese caso.
    - `llm` indica si la respuesta la generó el LLM (el canal decide con eso los
      metadatos/contadores, igual que antes).
    - `started` indica que un módulo quedó "a cargo" de la conversación durante
      el turno (p. ej. la reserva de turnos): el widget del módulo reemplaza a
      la narración del LLM.
    """

    message: Optional[str] = None
    widget: Optional[dict] = None
    history: list[ChatMessage] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)
    llm: bool = False
    started: bool = False


class AgentService:
    """Orquesta un turno del agente con las extensiones de los módulos."""

    @staticmethod
    def _namespace(session: dict, module_key: str) -> dict:
        return session.setdefault(module_key, {})

    async def active_extensions(self, bot) -> list[tuple[str, ChatContribution]]:
        """Extensiones de chat instaladas Y habilitadas para este bot."""
        module_service = get_module_service()
        active: list[tuple[str, ChatContribution]] = []
        for module_key, chat in enabled_chat_extensions():
            if await module_service.is_enabled(bot.bot_id, module_key):
                active.append((module_key, chat))
        return active

    @staticmethod
    def _collect_log(session: dict, extensions: list[tuple[str, ChatContribution]]) -> dict:
        log: dict = {}
        for module_key, _chat in extensions:
            entry = (session.get(module_key) or {}).get("log")
            if entry:
                log.update(entry)
        return log

    async def start_session(self, bot, *, client_id: Optional[str], session: dict) -> Optional[dict]:
        """Mensaje inicial de las extensiones que arrancan la conversación
        (p. ej. el embudo de leads), o None si ninguna aplica."""
        for module_key, chat in await self.active_extensions(bot):
            if not chat.startup:
                continue
            ns = self._namespace(session, module_key)
            result = await resolve_callable(chat.startup)(bot, client_id, ns)
            if result:
                return result
        return None

    async def build_tools(
        self,
        bot,
        client,
        client_id: Optional[str],
        canal: str,
        session: Optional[dict],
        extensions: list[tuple[str, ChatContribution]],
    ) -> tuple[Optional[list], Optional[Callable[[str, dict], dict]]]:
        """Tools del turno + dispatcher.

        Core (siempre): calificación por semáforo y fuentes públicas oficiales.
        De módulos: sólo si hay `session` (canales con sesión de chat), y sólo
        de los módulos habilitados para el bot.
        """
        if bot is None:
            return None, None

        tools: list[dict] = []
        executors: dict = {}

        if bot.config.auto_qualify_colors and client:
            tools.append(QUALIFICATION_TOOL_SPEC)
            executors[QUALIFICATION_TOOL_NAME] = build_qualification_tool_executor(
                client=client,
                canal=canal,
                allowed_colors=bot.config.auto_qualify_colors,
            )

        if session is not None:
            for module_key, chat in extensions:
                if not chat.tools_provider:
                    continue
                ns = self._namespace(session, module_key)
                ext_tools, ext_executors = resolve_callable(chat.tools_provider)(
                    bot, client, client_id, canal, ns
                )
                tools.extend(ext_tools)
                executors.update(ext_executors)

        if bot.config.public_sources:
            src_tools, src_executors = build_public_sources_tools(bot.config.public_sources)
            tools.extend(src_tools)
            executors.update(src_executors)

        if not tools:
            return None, None

        def _dispatch(tool_name: str, args: dict) -> dict:
            executor = executors.get(tool_name)
            if not executor:
                return {"error": f"Tool desconocida: {tool_name}"}
            return executor(tool_name, args)

        return tools, _dispatch

    async def run_turn(
        self,
        bot,
        *,
        user_text: str,
        client=None,
        client_id: Optional[str] = None,
        history: Optional[list[ChatMessage]] = None,
        canal: str = "web",
        session: Optional[dict] = None,
    ) -> TurnResult:
        """Resuelve un turno completo del agente.

        `session` es el estado por conexión del canal (dict que el canal crea al
        abrir la conexión y conserva); con `session=None` el turno sólo usa las
        contribuciones sin estado del agente.
        """
        history = history if history is not None else []
        can_extend = session is not None and bot is not None
        extensions = await self.active_extensions(bot) if can_extend else []

        # 1. Extensiones que responden ANTES del LLM (continuación de una reserva
        #    de turnos en curso, un paso del embudo de leads, ...).
        if can_extend:
            for module_key, chat in extensions:
                if not chat.interceptor:
                    continue
                ns = self._namespace(session, module_key)
                intercepted = await resolve_callable(chat.interceptor)(
                    bot, client_id, user_text, ns
                )
                if intercepted is not None:
                    metadata = self._collect_log(session, extensions)
                    widget = intercepted.get("widget")
                    if widget:
                        metadata["widget_type"] = widget.get("widget_type")
                    return TurnResult(
                        message=intercepted.get("message"),
                        widget=widget,
                        history=history,
                        metadata=metadata,
                    )

        # 2. RAG + tools + LLM.
        rag_context: Optional[str] = None
        if bot is not None and bot.config.use_rag:
            rag_context = get_rag_service().get_context(
                user_text, bot_id=bot.bot_id, n_results=bot.config.rag_results_count
            )

        tools, tool_dispatch = await self.build_tools(
            bot, client, client_id, canal, session, extensions
        )

        response = await get_llm_service().generate_response(
            user_message=user_text,
            context=rag_context,
            system_prompt=build_effective_system_prompt(bot.config) if bot is not None else None,
            conversation_history=history,
            max_tokens=bot.config.max_tokens if bot is not None else DEFAULT_MAX_TOKENS,
            thinking=(bot.config.llm_thinking or None) if bot is not None else None,
            tools=tools,
            tool_executor=tool_dispatch,
        )

        history.append(ChatMessage(role="user", content=user_text))
        history.append(ChatMessage(role="assistant", content=response.response))

        # 3. Si un módulo inició algo durante sus tools (p. ej. la reserva de
        #    turnos), lo que se le muestra al usuario es el resultado del módulo
        #    (widget del calendario), no la narración del LLM.
        module_output = None
        if can_extend:
            for module_key, _chat in extensions:
                candidate = self._namespace(session, module_key).pop("result", None)
                if candidate is not None and module_output is None:
                    module_output = candidate

        if module_output is not None:
            message = module_output["message"]
            widget = module_output.get("widget")
        else:
            message = response.response
            widget = None

        metadata = {
            "model": response.model,
            "tokens_used": response.tokens_used,
            "input_tokens": response.input_tokens,
            "output_tokens": response.output_tokens,
            "estimated_cost_usd": response.estimated_cost_usd,
            "rag_used": bool(rag_context),
            "context_length": len(rag_context or ""),
            "widget_type": (widget or {}).get("widget_type"),
        }
        if can_extend:
            metadata.update(self._collect_log(session, extensions))

        return TurnResult(
            message=message,
            widget=widget,
            history=history,
            metadata=metadata,
            llm=True,
            started=module_output is not None,
        )


_agent_service: Optional["AgentService"] = None


def get_agent_service() -> "AgentService":
    global _agent_service
    if _agent_service is None:
        _agent_service = AgentService()
    return _agent_service
