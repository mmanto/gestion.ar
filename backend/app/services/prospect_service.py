"""
Prospect Service - operaciones sobre prospectos en PostgreSQL (ver ADR-006 en docs/dev/DECISIONS.md)
"""

import uuid
from typing import Dict, Optional

from sqlalchemy import func, select

from app.db.database import AsyncSessionLocal
from app.db.models import Prospect as ProspectModel
from app.models.prospect import Prospect, ProspectCreate


def _to_prospect(row: ProspectModel) -> Prospect:
    return Prospect(
        prospect_id=row.prospect_id,
        tenant_id=row.tenant_id,
        estado=row.estado,
        nombre=row.nombre,
        fecha_interaccion=row.fecha_interaccion.isoformat(),
        canal=row.canal,
        whatsapp=row.whatsapp,
        email=row.email,
    )


class ProspectService:
    """Servicio para gestionar prospectos en PostgreSQL"""

    async def create_prospect(self, tenant_id: str, prospect_data: ProspectCreate) -> Prospect:
        """Crea un nuevo prospecto"""
        prospect_id = f"prospect_{uuid.uuid4().hex[:12]}"

        async with AsyncSessionLocal() as session:
            row = ProspectModel(
                prospect_id=prospect_id,
                tenant_id=tenant_id,
                estado=prospect_data.estado,
                nombre=prospect_data.nombre,
                canal=prospect_data.canal,
                whatsapp=prospect_data.whatsapp,
                email=prospect_data.email,
            )
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return _to_prospect(row)

    async def get_prospect(self, prospect_id: str) -> Optional[Prospect]:
        """Obtiene un prospecto por ID"""
        async with AsyncSessionLocal() as session:
            row = await session.get(ProspectModel, prospect_id)
            return _to_prospect(row) if row else None

    async def get_prospects_by_tenant(
        self,
        tenant_id: str,
        skip: int = 0,
        limit: int = 20,
    ) -> Dict:
        """Obtiene prospectos de un tenant con paginación"""
        filters = [ProspectModel.tenant_id == tenant_id]

        async with AsyncSessionLocal() as session:
            total = (await session.execute(
                select(func.count()).select_from(ProspectModel).where(*filters)
            )).scalar_one()

            result = await session.execute(
                select(ProspectModel)
                .where(*filters)
                .order_by(ProspectModel.fecha_interaccion.desc())
                .offset(skip)
                .limit(limit)
            )
            rows = result.scalars().all()

        return {
            "prospects": [_to_prospect(r) for r in rows],
            "total": total,
            "page": (skip // limit) + 1 if limit > 0 else 1,
            "pages": (total + limit - 1) // limit if limit > 0 else 0,
            "limit": limit,
        }


# Singleton
_prospect_service: Optional[ProspectService] = None


def get_prospect_service() -> ProspectService:
    """Obtiene la instancia singleton del servicio de prospectos"""
    global _prospect_service
    if _prospect_service is None:
        _prospect_service = ProspectService()
    return _prospect_service
