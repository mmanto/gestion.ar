"""
Resolución de las extensiones de chat declaradas en el manifiesto
(ver app/modules/manifest.py).

Los routers no conocen a los módulos: `AgentService` (app/services/agent_service.py)
pide acá las contribuciones instaladas y las resuelve por su referencia dotted.
"""

from __future__ import annotations

import importlib
from typing import Any

from app.modules.manifest import ChatContribution, enabled_manifests


def resolve_callable(dotted: str) -> Any:
    """Resuelve una referencia dotted `modulo:atributo`."""
    module_path, _, attr = dotted.partition(":")
    if not attr:
        raise RuntimeError(
            f"Referencia inválida en el manifiesto: '{dotted}' (esperado 'modulo:atributo')"
        )
    return getattr(importlib.import_module(module_path), attr)


def enabled_chat_extensions() -> list[tuple[str, ChatContribution]]:
    """Contribuciones de chat de los módulos instalados, en orden de manifiesto."""
    return [
        (module_key, manifest.chat)
        for module_key, manifest in enabled_manifests().items()
        if manifest.chat is not None
    ]
