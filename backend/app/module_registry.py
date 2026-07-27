"""
Registro de módulos first-party (ver ADR-008, docs/dev/DECISIONS.md).

FastAPI registra los routers una sola vez al boot para toda la app — no hay
"montaje condicional por tenant" real acá (las rutas son compartidas por
todos los tenants vía path params como /api/bots/{bot_id}/..., no un
proceso/mount por tenant). Lo que este registro centraliza es qué router
pertenece a qué module_key, como única fuente de verdad en vez de
repetirlo a mano en main.py cada vez que se agrega un módulo — y deja el
lugar donde, más adelante, se agregaría un router-proxy genérico para
módulos verified/third_party sin volver a tocar main.py.

El gating real por entitlement pasa a nivel de request
(`app.dependencies.modules.require_module_available`), no acá.
"""

from dataclasses import dataclass

from fastapi import APIRouter

from app.routers.appointments_router import router as appointments_router
from app.routers.appointments_webhook_router import router as appointments_webhook_router
from app.routers.document_router import router as document_router


@dataclass(frozen=True)
class ModuleDefinition:
    module_key: str
    router: APIRouter


MODULE_REGISTRY = [
    ModuleDefinition(module_key="appointments", router=appointments_router),
    ModuleDefinition(module_key="appointments", router=appointments_webhook_router),
    ModuleDefinition(module_key="rag", router=document_router),
]
