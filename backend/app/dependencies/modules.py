"""
Dependencia de entitlement de módulos (ver ADR-008, docs/dev/DECISIONS.md).

Distinto de `dependencies/auth.py` (autenticación/rol/tenant) — este
concern es "¿el módulo está disponible para este bot?", no "¿quién es el
usuario?". Se compone con `require_role(...)` en el `dependencies=[...]`
del router, no lo reemplaza.
"""

from fastapi import HTTPException, status

from app.services.module_service import get_module_service


def require_module_available(module_key: str):
    """Dependency factory: 403 si el módulo no está disponible (otorgado O
    incluido en el plan del tenant) para el bot de la request. `bot_id` se
    resuelve solo desde el path param del router
    (`/api/bots/{bot_id}/...`) — no requiere depender de `verify_bot_access`
    (que vive dentro de cada router). Uso:
    `dependencies=[Depends(require_module_available("appointments"))]`.
    """

    async def _check(bot_id: str) -> None:
        if not await get_module_service().is_available(bot_id, module_key):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"El módulo '{module_key}' no está disponible para este bot",
            )

    return _check
