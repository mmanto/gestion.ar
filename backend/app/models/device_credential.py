"""
DeviceCredential models - Pydantic schemas para el login biométrico (huella).

Un dispositivo genera un secreto aleatorio de alta entropía que queda cifrado
en el Keystore de Android (solo desbloqueable con la huella vía el plugin
nativo BiometricAuth). El backend solo conoce su hash SHA-256; nunca el
secreto en claro. Ver docs/dev/API.md y docs/dev/DATA_MODEL.md.
"""

from typing import Optional
from pydantic import BaseModel, Field


class BiometricEnrollRequest(BaseModel):
    """Alta (o actualización) de una credencial biométrica de dispositivo.

    El cliente genera el `secret` real, lo guarda cifrado en el Keystore del
    dispositivo y envía únicamente `secret_hash = sha256(secret)`. `device_id`
    es un UUID persistente del dispositivo (se regenera si se vuelve a
    enrolar desde cero).
    """
    device_id: str = Field(..., min_length=8, max_length=128, description="ID persistente del dispositivo")
    secret_hash: str = Field(..., min_length=64, max_length=64, description="sha256 hex del secreto del dispositivo")
    device_name: Optional[str] = Field(None, max_length=200, description="Nombre descriptivo del dispositivo")
    platform: Optional[str] = Field(None, max_length=50, description="android | ios | web")


class BiometricLoginRequest(BaseModel):
    """Login biométrico: el dispositivo presenta su `secret` (ya desbloqueado
    por la huella) y el backend lo verifica contra el hash guardado.
    """
    username: str = Field(..., description="Username del usuario")
    device_id: str = Field(..., max_length=128, description="ID persistente del dispositivo")
    secret: str = Field(..., min_length=32, description="Secreto del dispositivo, desbloqueado por la huella")


class DeviceCredentialInfo(BaseModel):
    """Registro de dispositivo tal como se devuelve al cliente (nunca el hash)."""
    device_id: str
    device_name: Optional[str] = None
    platform: Optional[str] = None
    created_at: str
    last_used_at: Optional[str] = None
    current: bool = False
