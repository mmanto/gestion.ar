"""
Device Service - Gestión de credenciales biométricas de dispositivo (login con huella).

Un dispositivo genera un `secret` aleatorio de alta entropía que el backend
nunca ve en claro: solo su hash SHA-256, en `device_credentials`. El login
biométrico (`POST /api/auth/biometric/login`) es el único punto que puede
emitir un token nuevo a partir de ese secreto y, por lo tanto, es el único
que NO requiere JWT. El resto (enroll, listar, revocar) requiere el usuario
autenticado.
"""

import hashlib
import logging
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import select

from app.db.database import AsyncSessionLocal
from app.db.models import DeviceCredential as DeviceCredentialModel

logger = logging.getLogger(__name__)


def sha256_hex(value: str) -> str:
    """Hash SHA-256 en hex lowercase — usado para almacenar (no el secreto) y verificar."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class DeviceService:
    async def enroll(
        self,
        username: str,
        device_id: str,
        secret_hash: str,
        device_name: Optional[str] = None,
        platform: Optional[str] = None,
    ) -> bool:
        """Alta o actualización de la credencial de un dispositivo para el usuario.

        Re-enrolar el mismo `device_id` actualiza el hash (cubre el caso de
        cambio de huella: el Keystore invalida el secreto anterior). Devolver
        True si ya existía (update) o False si es nuevo (insert).
        """
        async with AsyncSessionLocal() as session:
            existing = await session.get(DeviceCredentialModel, device_id)
            if existing:
                existing.username = username
                existing.secret_hash = secret_hash
                existing.device_name = device_name or existing.device_name
                existing.platform = platform or existing.platform
                existing.revoked = False
                await session.commit()
                return True

            session.add(
                DeviceCredentialModel(
                    device_id=device_id,
                    username=username,
                    secret_hash=secret_hash,
                    device_name=device_name,
                    platform=platform,
                )
            )
            await session.commit()
            return False

    async def verify_and_login(self, username: str, device_id: str, secret: str) -> bool:
        """Verifica el secreto presentado contra el hash del dispositivo.

        Marca `last_used_at` y devuelve True solo si el dispositivo existe,
        no está revocado, pertenece al usuario y el hash coincide.
        """
        async with AsyncSessionLocal() as session:
            row = await session.get(DeviceCredentialModel, device_id)
            if row is None or row.revoked or row.username != username:
                return False

            valid = row.secret_hash == sha256_hex(secret)
            if valid:
                row.last_used_at = datetime.now(timezone.utc)
                await session.commit()
            return valid

    async def list_devices(self, username: str) -> List[DeviceCredentialModel]:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(DeviceCredentialModel)
                .where(DeviceCredentialModel.username == username)
                .order_by(DeviceCredentialModel.created_at.desc())
            )
            return list(result.scalars().all())

    async def revoke(self, username: str, device_id: str, current_device_id: Optional[str] = None) -> bool:
        """Marca como revocado un dispositivo del usuario (DELETE).

        `current_device_id` (opcional) sirve para no permitir revocar el
        dispositivo desde el que se está operando salvo que sea explícito.
        Devuelve True si se encontró y revocó; False si no existía o no era
        del usuario.
        """
        async with AsyncSessionLocal() as session:
            row = await session.get(DeviceCredentialModel, device_id)
            if row is None or row.username != username:
                return False
            if row.device_id == current_device_id:
                return False
            row.revoked = True
            await session.commit()
            return True


_device_service: Optional[DeviceService] = None


def get_device_service() -> DeviceService:
    global _device_service
    if _device_service is None:
        _device_service = DeviceService()
    return _device_service
