"""
Reclamo Service — alta y listado de los reclamos georreferenciados de un
tenant (el mapa de /reclamos/ de la landing de pachoteayuda, ver
app/routers/reclamos_router.py).
"""

from typing import List, Optional
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.db.database import AsyncSessionLocal
from app.db.models import Reclamo as ReclamoModel
from app.models.reclamo import Reclamo, ReclamoCreate

# La fecha que ve el municipio es la del día local, no la UTC: un reclamo
# cargado a las 22:00 de Bolívar es del día anterior en UTC. Hoy los reclamos
# son de pachoteayuda (Argentina) — igual criterio que claude_service.py.
TZ_LOCAL = ZoneInfo("America/Argentina/Buenos_Aires")

# Tope defensivo del listado: el mapa no puede pintar pines infinitos y el
# registro todavía no tiene archivado ni paginado.
LIMITE_LISTADO = 500


def _to_reclamo(row: ReclamoModel) -> Reclamo:
    return Reclamo(
        id=row.reclamo_id,
        tipo=row.tipo,
        descripcion=row.descripcion,
        lugar=row.lugar,
        fecha=row.created_at.astimezone(TZ_LOCAL).date(),
        estado=row.estado,
        lat=float(row.lat),
        lon=float(row.lon),
    )


class ReclamoService:
    async def create_reclamo(
        self, tenant_id: str, data: ReclamoCreate, created_by: Optional[str] = None
    ) -> Reclamo:
        """Registra el reclamo de un vecino en el punto marcado en el mapa."""
        async with AsyncSessionLocal() as session:
            row = ReclamoModel(
                tenant_id=tenant_id,
                tipo=data.tipo,
                descripcion=data.descripcion,
                lugar=data.lugar or None,
                lat=data.lat,
                lon=data.lon,
                # El estado lo mueve el municipio; acá siempre nace pendiente.
                estado="pendiente",
                created_by=created_by,
            )
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return _to_reclamo(row)

    async def list_reclamos(self, tenant_id: str) -> List[Reclamo]:
        """Los reclamos del tenant, del más nuevo al más viejo."""
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(ReclamoModel)
                .where(ReclamoModel.tenant_id == tenant_id)
                .order_by(ReclamoModel.created_at.desc(), ReclamoModel.reclamo_id.desc())
                .limit(LIMITE_LISTADO)
            )
            return [_to_reclamo(row) for row in result.scalars().all()]


_reclamo_service: Optional[ReclamoService] = None


def get_reclamo_service() -> ReclamoService:
    global _reclamo_service
    if _reclamo_service is None:
        _reclamo_service = ReclamoService()
    return _reclamo_service
