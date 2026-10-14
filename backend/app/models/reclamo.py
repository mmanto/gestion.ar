"""
Reclamo models - contrato HTTP del mapa de reclamos de los vecinos
(sites/pachoteayuda-landing/reclamos/index.html).

El listado es público (lo consume el mapa sin sesión); la carga exige sesión de
un usuario del tenant. `created_by` no viaja en la respuesta: el reclamo es del
vecino, no de la cuenta que lo cargó.
"""

from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

# Los tipos y estados que conoce la landing (TIPOS/ESTADOS en
# reclamos/index.html). Un tipo nuevo se agrega en los dos lados.
TipoReclamo = Literal["basura", "agua"]
EstadoReclamo = Literal["pendiente", "en curso", "resuelto"]


class ReclamoCreate(BaseModel):
    """Lo que manda la landing cuando se marca un punto en el mapa."""

    tipo: TipoReclamo
    descripcion: str = Field(..., min_length=1, max_length=600)
    # Referencia del lugar en palabras ("frente a la plaza", "Zona norte"); el
    # punto exacto son lat/lon. Opcional: el pin ya ubica el reclamo.
    lugar: Optional[str] = Field(None, max_length=120)
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)

    @field_validator("descripcion", "lugar", mode="before")
    @classmethod
    def _sin_espacios_de_mas(cls, value: object) -> object:
        """Recorta antes de validar: un texto en blanco no es un reclamo."""
        return value.strip() if isinstance(value, str) else value


class Reclamo(BaseModel):
    """Un reclamo tal como lo pintan el mapa y la lista."""

    id: int
    tipo: TipoReclamo
    descripcion: str
    lugar: Optional[str] = None
    fecha: date
    estado: EstadoReclamo
    lat: float
    lon: float
