"""
Registro in-process de routers de módulos (ver app/modules/manifest.py).

FastAPI registra los routers una sola vez al boot para toda la app — no hay
"montaje condicional por tenant" real acá (las rutas son compartidas por
todos los tenants vía path params como /api/bots/{bot_id}/..., no un
proceso/mount por tenant). Lo que este registro centraliza es qué router
pertenece a qué module_key, tomándolo del manifiesto en vez de repetirlo a
mano en main.py — y deja el lugar donde, más adelante, se agregaría un
router-proxy genérico para módulos verified/third_party sin volver a tocar
main.py.

El gating real por entitlement pasa a nivel de request
(`app.dependencies.modules.require_module_available`), no acá.
"""

from __future__ import annotations

import importlib
from typing import Any

from fastapi import APIRouter

from app.modules.manifest import MODULE_MANIFESTS, enabled_manifests


def _resolve(dotted: str) -> Any:
    """Resuelve una referencia dotted `modulo:atributo`."""
    module_path, _, attr = dotted.partition(":")
    if not attr:
        raise RuntimeError(
            f"Referencia inválida en el manifiesto: '{dotted}' (esperado 'modulo:atributo')"
        )
    return getattr(importlib.import_module(module_path), attr)


def module_routers() -> list[tuple[str, APIRouter]]:
    """(module_key, router) por cada router declarado en los manifiestos
    instalados, en el orden de `MODULE_MANIFESTS` y sin duplicados."""
    enabled = enabled_manifests()
    routers: list[tuple[str, APIRouter]] = []
    seen: set[int] = set()
    for module_key, manifest in MODULE_MANIFESTS.items():
        if module_key not in enabled:
            continue
        for dotted in manifest.routers:
            router = _resolve(dotted)
            if id(router) in seen:
                continue
            seen.add(id(router))
            routers.append((module_key, router))
    return routers
