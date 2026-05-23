"""
PWA Router - Endpoints para gestión de suscripciones Web Push (VAPID)
Endpoints públicos para suscripción desde el navegador, y endpoints JWT para administración.
"""

from fastapi import APIRouter, HTTPException, Depends, Query, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.auth_service import get_current_user_from_token, User
from app.models.push_subscription import (
    PushSubscriptionCreate,
    SendNotificationRequest,
)
from app.services.push_service import get_push_service
from app.services.bot_service import get_bot_service
from app.services.channel_service import get_channel_service

router = APIRouter(prefix="/api/pwa", tags=["pwa"])
security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> User:
    """Dependency JWT: extrae el usuario actual del token"""
    token = credentials.credentials
    user = await get_current_user_from_token(token)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def verify_bot_ownership(bot_id: str, current_user: User):
    """Verifica que el usuario autenticado es el propietario del bot"""
    bot_service = get_bot_service()
    bot = await bot_service.get_bot_by_owner(bot_id, current_user.username)
    if not bot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bot no encontrado"
        )
    return bot


# ---------------------------------------------------------------------------
# Endpoints PÚBLICOS (no requieren JWT — el navegador los llama directamente)
# ---------------------------------------------------------------------------

@router.get("/vapid-public-key", response_model=dict)
async def get_vapid_public_key():
    """
    Retorna la clave pública VAPID.
    El frontend la usa para llamar a PushManager.subscribe({ applicationServerKey }).
    """
    push_service = get_push_service()
    public_key = push_service.get_vapid_public_key()

    if not public_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Push notifications no configuradas en el servidor"
        )

    return {"public_key": public_key}


@router.post("/subscribe", response_model=dict, status_code=status.HTTP_201_CREATED)
async def subscribe(data: PushSubscriptionCreate):
    """
    Registra una suscripción push del navegador.
    Si el endpoint ya existe, reactiva y actualiza la suscripción.
    Si no se proporciona bot_id, se deriva automáticamente del canal.

    Body:
        - channel_id: ID del canal PWA (requerido)
        - bot_id: ID del bot (opcional — se deriva del canal)
        - subscription: Objeto PushSubscription del navegador ({ endpoint, keys })
        - user_agent: (opcional) User-Agent del navegador
    """
    push_service = get_push_service()

    if not push_service.get_vapid_public_key():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Push notifications no disponibles"
        )

    # Derivar bot_id del canal si no se proporcionó
    if not data.bot_id:
        channel_service = get_channel_service()
        channel = await channel_service.get_channel(data.channel_id)
        if not channel:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Canal no encontrado"
            )
        data.bot_id = channel.bot_id

    subscription = await push_service.save_subscription(data)

    return {
        "success": True,
        "subscription_id": subscription.subscription_id,
        "public_key": push_service.get_vapid_public_key(),
    }


@router.delete("/unsubscribe", response_model=dict)
async def unsubscribe(body: dict):
    """
    Desactiva una suscripción push por su endpoint.

    Body: { "endpoint": "https://..." }
    """
    endpoint = body.get("endpoint")
    if not endpoint:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Se requiere el campo 'endpoint'"
        )

    push_service = get_push_service()
    deactivated = await push_service.deactivate_subscription(endpoint)

    return {"success": deactivated}


# ---------------------------------------------------------------------------
# Endpoints PROTEGIDOS (requieren JWT — solo el admin del bot puede usarlos)
# ---------------------------------------------------------------------------

@router.get("/{bot_id}/subscriptions", response_model=dict)
async def get_subscriptions(
    bot_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
):
    """
    Lista las suscripciones push activas de un bot.
    Requiere ser propietario del bot.
    """
    await verify_bot_ownership(bot_id, current_user)

    push_service = get_push_service()
    skip = (page - 1) * limit
    result = await push_service.get_subscriptions_by_bot(bot_id, skip=skip, limit=limit)

    return {
        "success": True,
        "subscriptions": [s.model_dump() for s in result["subscriptions"]],
        "total": result["total"],
        "page": page,
        "limit": limit,
    }


@router.post("/{bot_id}/send-notification", response_model=dict)
async def send_notification(
    bot_id: str,
    request: SendNotificationRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Envía una notificación push a todos los suscriptores activos del bot.
    Si se especifica client_id, solo envía a las suscripciones de ese cliente.

    Returns:
        { sent: N, failed: M, errors: [...] }
    """
    await verify_bot_ownership(bot_id, current_user)

    push_service = get_push_service()
    result = await push_service.broadcast_to_bot(bot_id, request)

    return {
        "success": True,
        "sent": result.sent,
        "failed": result.failed,
        "errors": result.errors,
    }


@router.delete("/{bot_id}/subscriptions/{subscription_id}", response_model=dict)
async def delete_subscription(
    bot_id: str,
    subscription_id: str,
    current_user: User = Depends(get_current_user),
):
    """Elimina permanentemente una suscripción (acción admin)"""
    await verify_bot_ownership(bot_id, current_user)

    push_service = get_push_service()
    deleted = await push_service.delete_subscription_by_id(subscription_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Suscripción no encontrada"
        )

    return {"success": True, "message": "Suscripción eliminada"}


@router.get("/{bot_id}/stats", response_model=dict)
async def get_pwa_stats(
    bot_id: str,
    current_user: User = Depends(get_current_user),
):
    """Estadísticas de suscripciones PWA del bot"""
    await verify_bot_ownership(bot_id, current_user)

    push_service = get_push_service()
    stats = await push_service.get_stats(bot_id)

    return {
        "success": True,
        **stats,
    }
