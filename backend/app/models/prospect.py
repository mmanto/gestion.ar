"""
Prospect models - Pydantic models for Prospect entity

Prospecto es conceptualmente distinto de Client: representa un contacto en
etapa de prospección, sin la relación con bot/conversaciones que tiene
Client. Comparte forma con Client hoy, pero se espera que evolucione con
campos propios (ver app/db/models.py).
"""

from typing import Optional
from pydantic import BaseModel


class ProspectCreate(BaseModel):
    """Modelo para crear un prospecto"""
    estado: str = "nuevo"
    nombre: str
    canal: Optional[str] = None
    whatsapp: Optional[str] = None
    email: Optional[str] = None


class Prospect(BaseModel):
    """Modelo completo de Prospecto"""
    prospect_id: str
    tenant_id: str
    estado: str
    nombre: str
    fecha_interaccion: str
    canal: Optional[str] = None
    whatsapp: Optional[str] = None
    email: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "prospect_id": "prospect_789abc123456",
                "tenant_id": "tenant_e9395487d4ad",
                "estado": "nuevo",
                "nombre": "Juan Pérez",
                "fecha_interaccion": "2026-07-10T15:00:00Z",
                "canal": "whatsapp",
                "whatsapp": "+5491123456789",
                "email": "juan@example.com",
            }
        }
