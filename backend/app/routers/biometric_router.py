"""
Biometric (huella) auth router — endpoints de login biométrico.

Flujo:
  - El dispositivo genera un secreto aleatorio, lo guarda cifrado en el
    Keystore de Android (solo desbloqueable con la huella) y registra su
    hash vía POST /api/auth/biometric/enroll (requiere JWT, porque el usuario
    ya se logueó con password/OAuth).
  - De ahí en más, POST /api/auth/biometric/login emite un JWT nuevo a
    partir del secreto presentado — es el ÚNICO endpoint de este router que
    NO requiere JWT.

Ids. de dispositivos listar/revocar: ver GET/DELETE /api/auth/biometric/devices.
"""

from datetime import timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth_service import ACCESS_TOKEN_EXPIRE_MINUTES, User, create_access_token
from app.dependencies.auth import get_current_user
from app.models.device_credential import (
    BiometricEnrollRequest,
    BiometricLoginRequest,
    DeviceCredentialInfo,
)
from app.services.device_service import get_device_service
from app.services.plan_service import get_plan_service
from app.services.user_service import get_user_service

router = APIRouter(prefix="/api/auth/biometric", tags=["biometric-auth"])


async def _user_response(user) -> dict:
    """Serializa el usuario en el mismo shape que GET /api/auth/me, incluyendo
    el plan suscripto, para que el login biométrico devuelva el usuario
    completo sin un round-trip extra a /auth/me."""
    requested_plan_id = user.requested_plan_id if user else None
    subscription_status = user.subscription_status if user else "active"
    plan_name = None
    if requested_plan_id:
        plan = await get_plan_service().get_plan(requested_plan_id)
        plan_name = plan.name if plan else None
    return {
        "username": user.username if user else None,
        "email": user.email,
        "nombre": user.nombre,
        "apellido": user.apellido,
        "avatar_url": user.avatar_url,
        "tenant_id": user.tenant_id,
        "role": user.role,
        "requested_plan_id": requested_plan_id,
        "subscription_status": subscription_status,
        "plan_name": plan_name,
    }


@router.post("/enroll", response_model=dict)
async def enroll(
    data: BiometricEnrollRequest,
    current_user: User = Depends(get_current_user),
):
    """Registra o actualiza la credencial biométrica de un dispositivo.

    Requiere JWT: el usuario debe estar autenticado (password u OAuth) para
    inscribir una huella. Solo se almacena `sha256(secret)`, nunca el secreto.
    """
    service = get_device_service()
    updated = await service.enroll(
        username=current_user.username,
        device_id=data.device_id,
        secret_hash=data.secret_hash,
        device_name=data.device_name,
        platform=data.platform,
    )
    return {
        "success": True,
        "device_id": data.device_id,
        "updated": updated,
        "message": "Credencial biométrica registrada" if not updated else "Credencial biométrica actualizada",
    }


@router.post("/login", response_model=dict)
async def biometric_login(data: BiometricLoginRequest):
    """Inicia sesión con la huella: emite un JWT válido a partir del secreto
    del dispositivo (ya desbloqueado por la huella en el cliente).

    No requiere JWT — es la contraparte biométrica de POST /api/auth/login.
    El secreto viaja una sola vez cifrado por TLS y se verifica contra el
    hash guardado en `device_credentials`.
    """
    service = get_device_service()
    valid = await service.verify_and_login(data.username, data.device_id, data.secret)
    user_in_db = await get_user_service().get_user_by_username(data.username)
    if not valid or user_in_db is None or user_in_db.disabled:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credencial biométrica inválida o revocada. Iniciá sesión con tu contraseña",
        )

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user_in_db.username, "tenant_id": user_in_db.tenant_id, "role": user_in_db.role},
        expires_delta=access_token_expires,
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": await _user_response(user_in_db),
    }


@router.get("/devices", response_model=List[DeviceCredentialInfo])
async def list_devices(current_user: User = Depends(get_current_user)):
    """Lista los dispositivos con login biométrico habilitado del usuario actual."""
    service = get_device_service()
    rows = await service.list_devices(current_user.username)
    out = []
    for row in rows:
        out.append(
            DeviceCredentialInfo(
                device_id=row.device_id,
                device_name=row.device_name,
                platform=row.platform,
                created_at=row.created_at.isoformat(),
                last_used_at=row.last_used_at.isoformat() if row.last_used_at else None,
                current=False,
            )
        )
    return out


@router.delete("/devices/{device_id}", response_model=dict)
async def revoke_device(
    device_id: str,
    current_user: User = Depends(get_current_user),
):
    """Revoca el login biométrico de un dispositivo del usuario actual."""
    service = get_device_service()
    revoked = await service.revoke(current_user.username, device_id)
    if not revoked:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dispositivo no encontrado o no pertenece al usuario",
        )
    return {"success": True, "device_id": device_id, "message": "Dispositivo revocado"}
