"""
Bot models - Pydantic models for Bot entity
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum


class BotStatus(str, Enum):
    """Estados posibles de un bot"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    MAINTENANCE = "maintenance"


class BotChannel(str, Enum):
    """Canales de comunicación soportados"""
    WHATSAPP = "whatsapp"
    TELEGRAM = "telegram"
    WEB = "web"


class FlowStep(BaseModel):
    """Un paso del flujo conversacional de captura de datos"""
    field: str = Field(..., description="Nombre del campo a capturar: name, email, phone, case_type, description")
    question: str = Field(..., description="Pregunta que el bot hace al usuario")
    field_type: str = Field(default="text", description="Tipo: text, email, phone, choice")
    choices: Optional[List[str]] = Field(None, description="Opciones disponibles (para field_type='choice')")
    required: bool = Field(default=True, description="Si el campo es obligatorio")
    validation_hint: Optional[str] = Field(None, description="Mensaje de ayuda si la validación falla")
    score_weight: float = Field(default=1.0, description="Peso para el lead scoring (ej: 5.0 para 'divorcio')")


class FlowConfig(BaseModel):
    """
    Configuración del flujo conversacional progresivo (Fase 2 - LeadTrackers Law).
    Si está configurado, el bot guía al usuario por una secuencia de preguntas
    antes de activar el chat libre con RAG.
    """
    enabled: bool = Field(default=False, description="Activar el flujo de captura de datos")
    steps: List[FlowStep] = Field(
        default_factory=list,
        description="Pasos del flujo en orden"
    )
    completion_message: str = Field(
        default="¡Gracias! He registrado tu información. Ahora puedes contarme más sobre tu caso.",
        description="Mensaje al completar el flujo"
    )
    skip_if_known: bool = Field(
        default=True,
        description="Saltar pasos si el cliente ya tiene el dato registrado"
    )


class BotConfig(BaseModel):
    """Configuración del bot"""
    system_prompt: str = Field(
        default="Eres un asistente virtual amable y profesional.",
        description="Prompt del sistema para el LLM"
    )
    ius_config: Optional[Dict[str, Any]] = Field(
        default=None,
        description="JSON de configuración del agente IUS. Si está presente, se usa como system prompt principal."
    )
    welcome_message: str = Field(
        default="¡Hola! ¿Cómo puedo ayudarte hoy?",
        description="Mensaje de bienvenida para nuevos clientes"
    )
    fallback_message: str = Field(
        default="Lo siento, no entendí tu mensaje. ¿Podrías reformularlo?",
        description="Mensaje cuando no se puede procesar"
    )
    max_tokens: int = Field(default=1024, ge=100, le=4096)
    temperature: float = Field(default=0.7, ge=0.0, le=1.0)
    use_rag: bool = Field(default=True, description="Usar RAG para respuestas")
    rag_results_count: int = Field(default=3, ge=1, le=10)
    rate_limit_messages: int = Field(default=10, description="Mensajes por minuto")
    rate_limit_window: int = Field(default=60, description="Ventana en segundos")
    flow: Optional[FlowConfig] = Field(
        default=None,
        description="Configuración del flujo de captura de datos progresivo (Fase 2)"
    )


class BotChannelConfig(BaseModel):
    """Configuración específica por canal"""
    channel: BotChannel
    enabled: bool = True
    webhook_url: Optional[str] = None
    api_credentials: Optional[Dict] = None


class BotBase(BaseModel):
    """Modelo base de Bot"""
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    business_type: str = Field(..., description="Tipo de negocio: restaurante, clínica, etc.")


class BotCreate(BotBase):
    """Modelo para crear un bot"""
    config: Optional[BotConfig] = None
    channels: Optional[List[BotChannelConfig]] = None


class BotUpdate(BaseModel):
    """Modelo para actualizar un bot"""
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    business_type: Optional[str] = None
    status: Optional[BotStatus] = None
    config: Optional[BotConfig] = None
    channels: Optional[List[BotChannelConfig]] = None


class Bot(BotBase):
    """Modelo completo de Bot"""
    bot_id: str
    owner_id: str = Field(..., description="ID del usuario propietario")
    status: BotStatus = BotStatus.ACTIVE
    config: BotConfig = Field(default_factory=BotConfig)
    channels: List[BotChannelConfig] = Field(default_factory=list, description="Configuración inline de canales (legacy)")
    channel_ids: List[str] = Field(default_factory=list, description="IDs de canales configurados")
    knowledge_base_id: Optional[str] = None
    created_at: str
    updated_at: str
    total_clients: int = 0
    total_conversations: int = 0
    total_messages: int = 0
    metadata: Optional[Dict] = None

    class Config:
        json_schema_extra = {
            "example": {
                "bot_id": "bot_123456",
                "name": "Asistente Restaurante El Buen Sabor",
                "description": "Bot para atención al cliente del restaurante",
                "business_type": "restaurante",
                "owner_id": "admin",
                "status": "active",
                "config": {
                    "system_prompt": "Eres el asistente virtual del restaurante El Buen Sabor...",
                    "welcome_message": "¡Bienvenido a El Buen Sabor! ¿En qué puedo ayudarte?",
                    "use_rag": True
                },
                "created_at": "2024-01-15T10:30:00Z",
                "updated_at": "2024-01-15T10:30:00Z"
            }
        }
