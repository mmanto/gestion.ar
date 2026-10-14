"""
Login con passkeys (WebAuthn) para usuarios de tenant — el botón "Entrar con
passkey" que acompaña al de Google en el frontend-tenant.

Usa las funciones de devbout-oauth (py_webauthn) pero con su propio mount y no
`create_router`, porque el login de tenant tiene una invariante extra que el
flujo genérico de la librería no puede expresar: la cuenta tiene que pertenecer
al tenant que originó el login — mismo criterio que
`UserService.find_or_create_tenant_user`, que rechaza "Ya existe una cuenta con
este email en otra organización". Una passkey resuelve al usuario por la
credencial, así que sin ese chequeo alguien de otra organización podría ingresar
desde este subdominio.

Endpoints (el frontend los llama sin el prefijo `/api`, que lo agrega
`VITE_API_URL`):

  POST   /register/options   (JWT)  opciones de navigator.credentials.create()
  POST   /register/verify    (JWT)  valida la attestation y guarda la passkey
  POST   /login/options      (–)    opciones de navigator.credentials.get()
  POST   /login/verify       (–)    valida la aserción y emite el JWT
  GET    /credentials        (JWT)  passkeys registradas del usuario
  DELETE /credentials/{id}   (JWT)  revoca una passkey

La misma SPA corre en el dominio de cada tenant (`pachoteayuda.ar`,
`ius.intellify.pro`, `erma.com.ar`, …), así que el RP ID de WebAuthn —que el
navegador exige igual al dominio de la página o a un sufijo suyo— se deriva del
origen de cada ceremonia (ver `_passkey_config`) y no de una config global.
"""
import logging
from typing import Annotated, Literal, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, StringConstraints

from app.auth_service import User
from app.dependencies.auth import get_current_user
from app.models.tenant import Tenant
from app.services.oauth_config import (
    build_nango_config,
    build_passkey_config,
    passkey_allowed_hosts,
)
from app.services.tenant_service import get_tenant_service
from app.services.user_service import get_user_service
from devbout_oauth import (
    PasskeyConfig,
    PasskeyError,
    PasskeyUser,
    authentication_options,
    credential_id_of,
    finish_authentication,
    finish_registration,
    registration_options,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tenant/oauth/passkey", tags=["tenant-passkey"])

_signing_key = build_nango_config().state_signing_key


def _page_origin(request: Request) -> str:
    """Origen de la página que inicia la ceremonia.

    Es el header `Origin` (lo pone el navegador y es el valor que WebAuthn
    valida), no el host del API: en prod el SPA y el API comparten dominio (el
    nginx del frontend reenvía el `Host` intacto), pero en dev el dev-server de
    Vite proxea /api al backend con `changeOrigin`, así que ahí el `Host` es el
    upstream y no el dominio de la página.
    """
    origin = (request.headers.get("origin") or "").strip().rstrip("/")
    if origin:
        return origin
    # Sin `Origin` (cliente que no es un navegador sobre la página) se
    # reconstruye del Host, respetando el esquema que anunció el proxy.
    scheme = (request.headers.get("x-forwarded-proto") or request.url.scheme).split(",")[0].strip()
    host = (request.headers.get("host") or "").strip()
    if not host:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Falta el header Origin (o Host) de la página")
    return f"{scheme}://{host}"


async def _passkey_config(request: Request) -> PasskeyConfig:
    """Config WebAuthn de esta ceremonia: RP ID = dominio de la página.

    Una passkey no puede cruzar dominios: el navegador solo acepta un `rpId`
    igual al dominio de la página (o un sufijo suyo). Como el mismo backend
    sirve la SPA de todos los tenants, el RP ID sale del origen de la request y
    el host tiene que ser un dominio que sirva alguna organización — si no,
    ninguna passkey podría usarse desde ahí y el navegador ya habría bloqueado
    la ceremonia con `SecurityError`.
    """
    origin = _page_origin(request)
    host = (urlparse(origin).hostname or "").lower()
    if not host:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Origin inválido: {origin}")
    if host not in passkey_allowed_hosts():
        tenant = await get_tenant_service().get_tenant_by_host(host)
        if tenant is None:
            logger.warning("Passkey en un dominio sin organización: %s", origin)
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Passkeys no disponibles en este dominio. Entrá desde el dominio de tu organización.",
            )
    return build_passkey_config(origin)


class _RegisterVerifyRequest(BaseModel):
    credential: dict
    challengeToken: str
    name: Optional[str] = None


class _LoginOptionsRequest(BaseModel):
    tenant_id: str
    username: Optional[str] = None


class _LoginVerifyRequest(BaseModel):
    tenant_id: str
    credential: dict
    challengeToken: str


class _SignupOptionsRequest(BaseModel):
    tenant_id: str
    nombre: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class _SignupVerifyRequest(BaseModel):
    tenant_id: str
    credential: dict
    challengeToken: str
    nombre: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    plan: Optional[Literal["mensual", "anual"]] = None


def _default_passkey_name(backed_up: bool) -> str:
    return "Passkey sincronizable" if backed_up else "Passkey de este dispositivo"


async def _ensure_active_tenant(tenant_id: str) -> Tenant:
    """Mismo chequeo que POST /api/tenant/oauth/connect/login/session."""
    tenant = await get_tenant_service().get_tenant(tenant_id)
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant no encontrado")
    if tenant.status == "suspended":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tenant suspendido")
    return tenant


# ── Registro (usuario ya autenticado) ─────────────────────────────────────────

@router.post("/register/options", response_model=dict)
async def passkey_register_options(
    current_user: User = Depends(get_current_user),
    config: PasskeyConfig = Depends(_passkey_config),
):
    """Opciones de registro para el usuario actual (ya ingresó con password o
    Google). Las passkeys ya registradas van como `excludeCredentials` para no
    pedir dos veces el mismo dispositivo."""
    service = get_user_service()
    user = await service.get_passkey_user(current_user.username)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado")
    existing = await service.list_passkeys(current_user.username)
    options, challenge_token = registration_options(
        config, _signing_key, user, existing
    )
    return {"options": options, "challengeToken": challenge_token}


@router.post("/register/verify", response_model=dict)
async def passkey_register_verify(
    body: _RegisterVerifyRequest,
    current_user: User = Depends(get_current_user),
    config: PasskeyConfig = Depends(_passkey_config),
):
    """Valida la attestation (desafío firmado, rp_id, origin) y guarda la clave
    pública de la passkey."""
    try:
        registered = finish_registration(
            config, _signing_key, body.credential, body.challengeToken
        )
    except PasskeyError as exc:
        logger.warning("Registro de passkey fallido para %s: %s", current_user.username, exc)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No se pudo verificar la passkey") from exc
    if registered.user_id != current_user.username:
        logger.warning("Registro de passkey: el desafío es de otro usuario")
        raise HTTPException(status.HTTP_403_FORBIDDEN, "La ceremonia no corresponde al usuario")

    service = get_user_service()
    if await service.get_passkey(registered.credential_id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Esa passkey ya está registrada")

    name = body.name or _default_passkey_name(registered.backed_up)
    await service.save_passkey(
        current_user.username,
        registered.credential_id,
        registered.public_key,
        registered.sign_count,
        registered.transports,
        name,
    )
    logger.info("Passkey registrada para %s (%s)", current_user.username, registered.device_type)
    return {
        "status": "registered",
        "credentialId": registered.credential_id,
        "name": name,
        "deviceType": registered.device_type,
        "backedUp": registered.backed_up,
    }


# ── Login (sin JWT) ───────────────────────────────────────────────────────────

@router.post("/login/options", response_model=dict)
async def passkey_login_options(
    body: _LoginOptionsRequest,
    config: PasskeyConfig = Depends(_passkey_config),
):
    """Opciones de ingreso. Sin `username` es un login "sin usuario": el
    navegador ofrece cualquier passkey de este dominio y la cuenta se resuelve
    al verificar la aserción.

    Si todavía no hay ninguna passkey registrada, se responde 409 con
    instrucciones en lugar de abrir el picker del sistema: ahí el navegador no
    encuentra credenciales y solo ofrece escanear un QR con otro dispositivo
    (no hay forma de *crear* una passkey desde esa pantalla — la creación
    requiere sesión iniciada, ver /register/options y la sección Passkeys de
    Ajustes).
    """
    await _ensure_active_tenant(body.tenant_id)

    service = get_user_service()
    credentials = []
    user_id = ""
    if body.username:
        user = await service.get_passkey_user_by_username(body.username)
        if user is not None:
            credentials = await service.list_passkeys(user.user_id)
            if not credentials:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    "Esta cuenta todavía no tiene ninguna passkey. Entrá con tu contraseña "
                    "(o con Google) y creá una desde Ajustes → Passkeys.",
                )
            # El usuario del handle puede ser de otra organización (su email no
            # cambia): el rechazo real, con el mismo mensaje que el login OAuth,
            # ocurre en /login/verify.
            user_id = user.user_id
    elif not await service.tenant_has_passkeys(body.tenant_id):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Todavía no hay passkeys registradas en este espacio. Entrá con tu contraseña "
            "(o con Google) y creá la primera desde Ajustes → Passkeys.",
        )

    options, challenge_token = authentication_options(
        config, _signing_key, credentials, user_id
    )
    return {"options": options, "challengeToken": challenge_token}


@router.post("/login/verify", response_model=dict)
async def passkey_login_verify(
    body: _LoginVerifyRequest,
    config: PasskeyConfig = Depends(_passkey_config),
):
    """Valida la aserción contra la clave pública guardada y emite el JWT, con
    la misma forma que el login OAuth de tenant."""
    await _ensure_active_tenant(body.tenant_id)

    try:
        credential_id = credential_id_of(body.credential)
    except PasskeyError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    service = get_user_service()
    stored = await service.get_passkey(credential_id)
    if stored is None:
        logger.warning("Login con passkey: credencial desconocida %s", credential_id)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Passkey no reconocida")

    # La passkey autentica a un usuario concreto: solo puede ingresar por este
    # tenant si su cuenta pertenece a él (ver docstring del módulo).
    account = await service.get_user_by_username(stored.user_id)
    if account is None or account.disabled:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Passkey no reconocida")
    if account.tenant_id != body.tenant_id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Ya existe una cuenta con este email en otra organización.",
        )

    try:
        new_sign_count = finish_authentication(
            config, _signing_key, body.credential, body.challengeToken, stored
        )
    except PasskeyError as exc:
        logger.warning("Login con passkey fallido para %s: %s", stored.user_id, exc)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No se pudo verificar la passkey") from exc

    await service.update_passkey_sign_count(credential_id, new_sign_count)
    token = await service.issue_app_token(stored.user_id)
    logger.info("Login con passkey: %s (tenant %s)", stored.user_id, body.tenant_id)
    return {
        "token": token,
        "username": account.username,
        "email": account.email,
        "provider": "passkey",
    }


# ── Alta de cuenta con passkey (sin email ni teléfono) ────────────────────────

@router.post("/signup/options", response_model=dict)
async def passkey_signup_options(
    body: _SignupOptionsRequest,
    config: PasskeyConfig = Depends(_passkey_config),
):
    """Opciones de registro para una cuenta que todavía **no** existe.

    El `username` se genera acá (`pk_<hex>`) y viaja firmado dentro del
    `challengeToken`: no se crea ninguna fila en `users` hasta que la
    attestation se verifica, así que una ceremonia abandonada no deja cuentas a
    medio crear, y nadie puede elegir un username ajeno (el token está firmado).
    """
    await _ensure_active_tenant(body.tenant_id)

    username = await get_user_service().next_passkey_username()
    display = body.nombre
    user = PasskeyUser(user_id=username, username=display, display_name=display)
    options, challenge_token = registration_options(config, _signing_key, user)
    return {"options": options, "challengeToken": challenge_token}


@router.post("/signup/verify", response_model=dict)
async def passkey_signup_verify(
    body: _SignupVerifyRequest,
    config: PasskeyConfig = Depends(_passkey_config),
):
    """Valida la attestation y crea la cuenta + la passkey.

    La cuenta queda con el rol `operativo` del login de tenant, sin email ni
    teléfono (los completa administración) y con el plan elegido pendiente de
    aprobación si el alta vino de la pantalla de registro — el mismo camino que
    el alta por Gmail.
    """
    tenant = await _ensure_active_tenant(body.tenant_id)

    try:
        registered = finish_registration(
            config, _signing_key, body.credential, body.challengeToken
        )
    except PasskeyError as exc:
        logger.warning("Alta con passkey fallida en tenant %s: %s", body.tenant_id, exc)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No se pudo verificar la passkey") from exc

    service = get_user_service()
    if await service.get_passkey(registered.credential_id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Esa passkey ya está registrada")
    if await service.get_user_by_username(registered.user_id) is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Ese usuario ya existe: volvé a intentar el alta"
        )

    # En un tenant con alta gratuita (ver Tenant.free_signup) no se registra
    # ningún plan: la cuenta queda vigente y sin pago.
    plan = None if tenant.free_signup else body.plan
    try:
        username, token = await service.create_passkey_account(
            tenant_id=body.tenant_id,
            username=registered.user_id,
            nombre=body.nombre,
            plan=plan,
        )
    except ValueError as exc:  # carrera: el username se ocupó entre options y verify
        logger.warning("Alta con passkey: %s", exc)
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Ese usuario ya existe: volvé a intentar el alta"
        ) from exc

    await service.save_passkey(
        username,
        registered.credential_id,
        registered.public_key,
        registered.sign_count,
        registered.transports,
        _default_passkey_name(registered.backed_up),
    )
    logger.info("Alta con passkey en tenant %s: %s (plan %s)", body.tenant_id, username, plan)
    return {"token": token, "username": username, "provider": "passkey"}


# ── Gestión de las passkeys registradas ───────────────────────────────────────

@router.get("/credentials", response_model=dict)
async def passkey_credentials(current_user: User = Depends(get_current_user)):
    """Passkeys registradas del usuario actual (para la sección de Ajustes)."""
    credentials = await get_user_service().list_passkeys(current_user.username)
    return {
        "credentials": [
            {
                "id": credential.credential_id,
                "name": credential.name,
                "transports": credential.transports,
                "created_at": credential.created_at.isoformat() if credential.created_at else None,
            }
            for credential in credentials
        ]
    }


@router.delete("/credentials/{credential_id}", status_code=204)
async def passkey_revoke(
    credential_id: str,
    current_user: User = Depends(get_current_user),
):
    """Revoca una passkey del usuario actual (el dispositivo puede volver a
    registrar una nueva cuando quiera)."""
    service = get_user_service()
    stored = await service.get_passkey(credential_id)
    if stored is None or stored.user_id != current_user.username:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Passkey no encontrada")
    await service.delete_passkey(current_user.username, credential_id)
    logger.info("Passkey %s revocada para %s", credential_id, current_user.username)
