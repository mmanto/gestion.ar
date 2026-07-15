"""
Client models - Pydantic models for Client entity
"""

from typing import Optional, Dict, Literal
from pydantic import BaseModel, Field
from enum import Enum

SemaforoColor = Literal["verde", "amarillo", "rojo"]

SEMAFORO_ESTADO_LABELS: Dict[str, str] = {
    "verde": "Viable",
    "amarillo": "Potencial",
    "rojo": "Exploración",
}


def estado_from_color(color: Optional[str]) -> str:
    """Deriva el estado del embudo a partir de color_semaforo — no es un dato
    independiente, así nunca puede quedar desincronizado del color."""
    return SEMAFORO_ESTADO_LABELS.get(color or "", "Sin clasificar")


class ClientSource(str, Enum):
    """Fuente de donde proviene el cliente"""
    WHATSAPP = "whatsapp"
    TELEGRAM = "telegram"
    WEB = "web"
    MANUAL = "manual"


class ClientStatus(str, Enum):
    """Estados del cliente"""
    ACTIVE = "active"
    BLOCKED = "blocked"
    ARCHIVED = "archived"


class ClientBase(BaseModel):
    """Modelo base de Cliente"""
    bot_id: str = Field(..., description="ID del bot asociado")
    external_id: str = Field(..., description="ID externo (teléfono, chat_id, etc)")
    source: ClientSource = Field(..., description="Canal de origen")


class ClientCreate(ClientBase):
    """Modelo para crear un cliente"""
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    metadata: Optional[Dict] = None


class ClientUpdate(BaseModel):
    """Modelo para actualizar un cliente"""
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[ClientStatus] = None
    score: Optional[float] = None
    metadata: Optional[Dict] = None
    color_semaforo: Optional[SemaforoColor] = None
    notas: Optional[str] = None


class Client(ClientBase):
    """Modelo completo de Cliente"""
    client_id: str
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    status: ClientStatus = ClientStatus.ACTIVE
    first_contact_at: str
    last_contact_at: str
    total_conversations: int = 0
    total_messages: int = 0
    total_tokens_used: int = 0
    score: float = 0.0
    metadata: Optional[Dict] = None
    # Derivado de color_semaforo (ver estado_from_color) — no se recibe como
    # input, solo se completa al construir la respuesta.
    estado: str = "Sin clasificar"
    color_semaforo: Optional[SemaforoColor] = None
    notas: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "client_id": "client_789",
                "bot_id": "bot_123456",
                "external_id": "+5491123456789",
                "source": "whatsapp",
                "name": "Juan Pérez",
                "phone": "+5491123456789",
                "status": "active",
                "first_contact_at": "2024-01-10T15:00:00Z",
                "last_contact_at": "2024-01-15T10:30:00Z",
                "total_conversations": 5,
                "total_messages": 47
            }
        }
