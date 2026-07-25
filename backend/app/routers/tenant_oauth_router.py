"""
Tenant OAuth Router - Login + alta self-service de usuarios de tenant, vía
Nango (Google/Microsoft).

A diferencia de google_oauth_router.py (administración general, sin
autoregistro — toda cuenta la crea super_admin), acá un usuario nuevo SÍ
puede darse de alta automáticamente la primera vez que completa el flujo,
siempre scoped al tenant_id que originó la sesión de login (ver
TenantContext en frontend-tenant, resuelto por contenedor/dominio).

No reusa devbout_oauth.create_router porque su nonce de login no lleva
contexto de tenant — acá se firma un nonce propio (mismo signing key, otro
`purpose`) que sí lo lleva, y se delega en
UserService.find_or_create_tenant_user (que, a diferencia de
find_or_create_by_identity, crea la cuenta si no existe).
"""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, status
from jose import JWTError, jwt
from pydantic import BaseModel

from app.services.oauth_config import build_nango_config
from app.services.tenant_service import get_tenant_service
from app.services.user_service import get_user_service
from devbout_oauth import NangoClient, NangoError
from devbout_oauth.identity import fetch_identity

router = APIRouter(prefix="/api/tenant/oauth", tags=["tenant-oauth"])

_config = build_nango_config()
_nango = NangoClient(_config)

_ALGORITHM = "HS256"
_EXPIRE_MINUTES = 5
_PURPOSE = "tenant_oauth_signup"


def _create_nonce(tenant_id: str) -> tuple[str, str]:
    """Return (nonce_id, signed_token). nonce_id is used as Nango end_user.id."""
    nonce_id = f"tsignup_{uuid.uuid4().hex}"
    payload = {
        "sub": nonce_id,
        "tenant_id": tenant_id,
        "purpose": _PURPOSE,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=_EXPIRE_MINUTES),
    }
    return nonce_id, jwt.encode(payload, _config.state_signing_key, algorithm=_ALGORITHM)


def _verify_nonce(token: str) -> tuple[str, str]:
    """Return (nonce_id, tenant_id), or raise HTTP 400 if invalid/expired."""
    try:
        payload = jwt.decode(token, _config.state_signing_key, algorithms=[_ALGORITHM])
        if payload.get("purpose") != _PURPOSE:
            raise ValueError("not a tenant signup nonce")
        return payload["sub"], payload["tenant_id"]
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sesión de login inválida o expirada")


def _integration_key(provider: str) -> str:
    if provider == "google":
        return _config.google_integration_key
    if provider == "microsoft":
        return _config.microsoft_integration_key
    raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Provider no soportado: {provider}")


class _SessionRequest(BaseModel):
    tenant_id: str
    provider: str


class _FinalizeRequest(BaseModel):
    connectionId: str
    provider: str
    nonce: str


@router.post("/connect/login/session")
async def tenant_login_session(body: _SessionRequest):
    tenant = await get_tenant_service().get_tenant(body.tenant_id)
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant no encontrado")
    if tenant.status == "suspended":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tenant suspendido")

    integration_key = _integration_key(body.provider)
    nonce_id, nonce_token = _create_nonce(body.tenant_id)
    try:
        session_token = await _nango.create_connect_session(
            end_user={"id": nonce_id},
            allowed_integrations=[integration_key],
        )
    except NangoError as e:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"El login con {body.provider} no está disponible en este momento",
        ) from e
    return {
        "sessionToken": session_token,
        "nonce": nonce_token,
        "provider": body.provider,
        "providerConfigKey": integration_key,
    }


@router.post("/connect/login/finalize")
async def tenant_login_finalize(body: _FinalizeRequest):
    integration_key = _integration_key(body.provider)
    nonce_id, tenant_id = _verify_nonce(body.nonce)

    try:
        conn = await _nango.get_connection(body.connectionId, integration_key)
    except NangoError as e:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"El login con {body.provider} no está disponible en este momento",
        ) from e
    end_user_id = (conn.get("end_user") or {}).get("id", "")
    if end_user_id != nonce_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Connection no coincide con la sesión")

    access_token = (conn.get("credentials") or {}).get("access_token", "")
    identity = await fetch_identity(body.provider, access_token)
    if not identity.email or not identity.provider_user_id:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "No se pudo obtener la identidad del proveedor"
        )

    user_service = get_user_service()
    try:
        username, app_token = await user_service.find_or_create_tenant_user(
            tenant_id, identity.provider, identity.provider_user_id,
            identity.email, identity.given_name, identity.family_name,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

    await user_service.save_connection(username, body.provider, body.connectionId, identity.email)
    return {
        "token": app_token,
        "email": identity.email,
        "given_name": identity.given_name,
        "family_name": identity.family_name,
        "provider": body.provider,
    }
