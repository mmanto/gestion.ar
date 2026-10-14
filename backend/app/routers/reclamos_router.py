"""
Mapa de reclamos de los vecinos — landing de pachoteayuda (`/reclamos/`).

Dos superficies con niveles de confianza distintos:

- `GET /api/reclamos` es **público**: es el mapa que ve cualquier vecino, sin
  cuenta. El tenant sale del Host (mismo criterio que
  `/api/public/tenants/current`) y la respuesta no expone quién cargó cada
  reclamo.
- `POST /api/reclamos` exige sesión de un usuario del tenant. La landing es una
  página estática que comparte origen con el SPA, así que manda el mismo JWT
  (ver sites/pachoteayuda-landing/reclamos/index.html) y el reclamo queda en el
  `tenant_id` de esa cuenta.

No es un módulo (ADR-028/ADR-029) a propósito: un módulo aporta pantallas
propias o extensiones del chat, y esto es un recurso del tenant que sólo
consume la landing — ver ADR-033 en docs/dev/DECISIONS.md.
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.auth_service import User
from app.dependencies.auth import get_current_user
from app.models.reclamo import Reclamo, ReclamoCreate
from app.services.reclamo_service import get_reclamo_service
from app.services.tenant_service import get_tenant_service

router = APIRouter(prefix="/api/reclamos", tags=["Reclamos"])


async def _tenant_id_del_host(request: Request) -> str:
    """El tenant del dominio que sirvió la página: el Host llega sin reescribir
    desde el browser, por Traefik y por el nginx del SPA del tenant."""
    host = request.headers.get("host") or ""
    tenant = await get_tenant_service().get_tenant_by_host(host)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant no encontrado")
    return tenant.tenant_id


@router.get("", response_model=List[Reclamo])
async def listar_reclamos(request: Request) -> List[Reclamo]:
    """Los reclamos del tenant del dominio (lo que pinta el mapa)."""
    return await get_reclamo_service().list_reclamos(await _tenant_id_del_host(request))


@router.post("", response_model=Reclamo, status_code=status.HTTP_201_CREATED)
async def crear_reclamo(
    data: ReclamoCreate,
    current_user: User = Depends(get_current_user),
) -> Reclamo:
    """Registra un reclamo en el punto que marcó el vecino."""
    if not current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El usuario no pertenece a ningún tenant",
        )
    return await get_reclamo_service().create_reclamo(
        tenant_id=current_user.tenant_id,
        data=data,
        created_by=current_user.username,
    )
