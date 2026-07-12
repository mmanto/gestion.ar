"""
Prospect Router - API endpoints para la entidad Prospecto (tenant-scoped,
sin relación con bots — ver app/db/models.py:Prospect)
"""

from fastapi import APIRouter, HTTPException, Depends, Query, status

from app.models.prospect import ProspectCreate
from app.services.prospect_service import get_prospect_service
from app.auth_service import User
from app.dependencies.auth import get_current_user

router = APIRouter(prefix="/api/prospects", tags=["prospects"])


@router.get("", response_model=dict)
async def get_prospects(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    """Obtener prospectos del tenant autenticado"""
    prospect_service = get_prospect_service()
    skip = (page - 1) * limit

    result = await prospect_service.get_prospects_by_tenant(
        tenant_id=current_user.tenant_id,
        skip=skip,
        limit=limit,
    )

    return {
        "success": True,
        "prospects": [p.model_dump() for p in result["prospects"]],
        "total": result["total"],
        "page": result["page"],
        "pages": result["pages"],
        "limit": result["limit"],
    }


@router.get("/{prospect_id}", response_model=dict)
async def get_prospect(
    prospect_id: str,
    current_user: User = Depends(get_current_user),
):
    """Obtener un prospecto por ID"""
    prospect_service = get_prospect_service()
    prospect = await prospect_service.get_prospect(prospect_id)

    if not prospect or prospect.tenant_id != current_user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prospecto no encontrado",
        )

    return {
        "success": True,
        "prospect": prospect.model_dump(),
    }


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_prospect(
    prospect_data: ProspectCreate,
    current_user: User = Depends(get_current_user),
):
    """Crear un prospecto"""
    prospect_service = get_prospect_service()
    prospect = await prospect_service.create_prospect(current_user.tenant_id, prospect_data)

    return {
        "success": True,
        "prospect": prospect.model_dump(),
    }
