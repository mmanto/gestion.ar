"""
Manifiesto de módulos first-party (ver ADR-008/ADR-028, docs/dev/DECISIONS.md).

Fuente de verdad de QUÉ módulos existen y CÓMO se enchufan.

El **agente** es un módulo más (`scope="platform"`): aporta las pantallas del
agente (bots, canales) y es el host del chat y de sus extension points. Los demás
módulos son **independientes de él**: un módulo declara contribuciones de chat
(`chat`) para funcionar *con* un agente —la interfaz es el chat— y sus propias
pantallas (`admin`/`tenant`) para funcionar **de manera autónoma**, sin agente.
Por eso ninguno lo declara en `requires`: puede haber tenants sin agente que usen
un módulo con pantallas propias (p. ej. turnos).

`ENABLED_MODULES` (env, CSV de module_key) es el "install list" del deploy:
si está ausente, se instalan todos los manifiestos; si está presente, sólo
los listados. Un módulo cuyos `requires` no estén instalados corta el boot.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

# `platform` = lo instala el deploy, sin entitlement (el agente).
# `entitled` = se otorga por tenant (o por bot, como antes) — ver
# `tenant_modules`/`bot_modules` y ADR-028/ADR-029.
ModuleScope = Literal["platform", "entitled"]


@dataclass(frozen=True)
class NavEntry:
    to: str
    label: str
    icon: str
    roles: tuple[str, ...] = ()


@dataclass(frozen=True)
class BotTab:
    """Pantalla de módulo dentro del agente. `path` usa el placeholder
    `:botId` (p. ej. `/bots/:botId/documents`)."""

    path: str
    label: str


@dataclass(frozen=True)
class AdminScreens:
    """Superficies del módulo en la consola de administración (`frontend/`)."""

    nav: NavEntry | None = None
    bot_tabs: tuple[BotTab, ...] = ()


@dataclass(frozen=True)
class TenantScreens:
    """Superficies del módulo en el backoffice de tenant (`frontend-tenant/`)."""

    nav: tuple[NavEntry, ...] = ()


@dataclass(frozen=True)
class ChatContribution:
    """Extensión del chat que aporta el módulo. `tools_provider`, `startup` e
    `interceptor` son referencias dotted (`modulo:atributo`) resueltas por
    `app.modules.agent_runtime`.

    - `startup(bot, client_id, ns) -> dict | None`: al abrir una sesión de chat,
      devuelve el primer mensaje con el que el módulo arranca la conversación.
    - `interceptor(bot, client_id, user_text, ns) -> dict | None`: responde el
      turno ANTES del LLM (p. ej. un paso del embudo).
    - `tools_provider(bot, client, client_id, canal, ns) -> (tools, executors)`:
      tools que el LLM puede invocar durante el turno.

    `ns` es el namespace mutable del módulo dentro de la sesión de chat (estado
    por conexión), provisto por `AgentService`; el módulo puede escribir
    `ns["log"]` para aportar metadata al registro de la conversación.
    """

    tools_provider: str | None = None
    startup: str | None = None
    interceptor: str | None = None
    widget_types: tuple[str, ...] = ()


@dataclass(frozen=True)
class ModuleManifest:
    module_key: str
    name: str
    description: str
    version: str
    scope: ModuleScope
    requires: tuple[str, ...] = ()
    routers: tuple[str, ...] = ()
    chat: ChatContribution | None = None
    admin: AdminScreens | None = None
    tenant: TenantScreens | None = None


MODULE_MANIFESTS: dict[str, ModuleManifest] = {
    "agent": ModuleManifest(
        module_key="agent",
        name="Agente",
        description="Agente conversacional: chat, canales y runtime LLM.",
        version="1.0.0",
        scope="platform",
        admin=AdminScreens(
            nav=NavEntry(to="/bots", label="Agentes", icon="Bot"),
            bot_tabs=(BotTab(path="/bots/:botId/channels", label="Canales"),),
        ),
    ),
    "rag": ModuleManifest(
        module_key="rag",
        name="Base de conocimiento (RAG)",
        description="Documentos y recuperación aumentada de contexto para el agente.",
        version="1.0.0",
        scope="entitled",
        routers=("app.routers.document_router:router",),
        admin=AdminScreens(
            bot_tabs=(BotTab(path="/bots/:botId/documents", label="Documentos"),),
        ),
    ),
    "appointments": ModuleManifest(
        module_key="appointments",
        name="Turnos",
        description="Reserva de turnos por chat y calendario.",
        version="1.0.0",
        scope="entitled",
        routers=(
            "app.routers.appointments_router:router",
            "app.routers.appointments_webhook_router:router",
            "app.routers.tenant_appointments_router:router",
        ),
        chat=ChatContribution(
            tools_provider="app.modules.appointments_ext:provide_tools",
            interceptor="app.modules.appointments_ext:intercept",
            widget_types=(
                "appointment_options",
                "appointment_calendar",
                "appointment_times",
                "appointment_confirm",
            ),
        ),
        admin=AdminScreens(
            bot_tabs=(BotTab(path="/bots/:botId/appointments", label="Turnos"),),
        ),
    ),
    "lead_funnel": ModuleManifest(
        module_key="lead_funnel",
        name="Embudo de leads",
        description="Flujo guiado de calificación que responde antes del LLM.",
        version="1.0.0",
        scope="entitled",
        chat=ChatContribution(
            tools_provider="app.modules.lead_funnel_ext:provide_tools",
            startup="app.modules.lead_funnel_ext:startup",
            interceptor="app.modules.lead_funnel_ext:intercept",
        ),
    ),
}


def _validate_manifests() -> None:
    """Cada `requires` debe existir en el manifiesto (validación en import)."""
    for key, manifest in MODULE_MANIFESTS.items():
        for dep in manifest.requires:
            if dep not in MODULE_MANIFESTS:
                raise RuntimeError(
                    f"El módulo '{key}' requiere '{dep}', que no existe en el manifiesto"
                )


_validate_manifests()


def _requested_keys() -> set[str] | None:
    raw = os.environ.get("ENABLED_MODULES")
    if raw is None or not raw.strip():
        return None
    return {key.strip() for key in raw.split(",") if key.strip()}


def enabled_manifests() -> dict[str, ModuleManifest]:
    """Manifiestos instalados en este deploy (filtrados por `ENABLED_MODULES`).

    Lanza `RuntimeError` si el listado pide un módulo inexistente o si un
    módulo instalado depende de otro que no lo está.
    """
    requested = _requested_keys()
    if requested is None:
        enabled = dict(MODULE_MANIFESTS)
    else:
        unknown = requested - set(MODULE_MANIFESTS)
        if unknown:
            raise RuntimeError(
                f"Módulos desconocidos en ENABLED_MODULES: {sorted(unknown)}"
            )
        enabled = {key: man for key, man in MODULE_MANIFESTS.items() if key in requested}

    for key, manifest in enabled.items():
        missing = tuple(dep for dep in manifest.requires if dep not in enabled)
        if missing:
            raise RuntimeError(
                f"El módulo '{key}' requiere {missing} y no está instalado"
            )

    return enabled


def get_manifest(module_key: str) -> ModuleManifest:
    return MODULE_MANIFESTS[module_key]
