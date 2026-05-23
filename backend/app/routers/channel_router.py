"""
Channel Router - API endpoints for channel management
"""

import io

import qrcode
from fastapi import APIRouter, HTTPException, Depends, Query, status
from fastapi.responses import Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional

import logging

from app.models.channel import (
    ChannelCreate,
    ChannelUpdate,
    ChannelStatus,
    ChannelType,
)
from app.services.channel_service import get_channel_service
from app.services.bot_service import get_bot_service
from app.auth_service import get_current_user_from_token, User
from app.telegram_service import create_telegram_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/bots/{bot_id}/channels", tags=["channels"])

# Esquema de seguridad HTTP Bearer
security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> User:
    """Dependency para obtener el usuario actual desde el token JWT"""
    token = credentials.credentials
    user = await get_current_user_from_token(token)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


async def verify_bot_access(bot_id: str, current_user: User):
    """Verificar acceso al bot"""
    bot_service = get_bot_service()
    bot = await bot_service.get_bot_by_owner(bot_id, current_user.username)

    if not bot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bot no encontrado"
        )

    return bot


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_channel(
    bot_id: str,
    channel_data: ChannelCreate,
    current_user: User = Depends(get_current_user)
):
    """
    Crear un nuevo canal para un bot

    - **channel_type**: Tipo de canal (whatsapp o telegram)
    - **name**: Nombre identificador del canal
    - **whatsapp_config**: Configuración de WhatsApp (si es tipo whatsapp)
    - **telegram_config**: Configuración de Telegram (si es tipo telegram)
    """
    await verify_bot_access(bot_id, current_user)

    # Validar que se proporciona la configuración correcta según el tipo
    if channel_data.channel_type == ChannelType.WHATSAPP and not channel_data.whatsapp_config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Se requiere whatsapp_config para canales de tipo WhatsApp"
        )

    if channel_data.channel_type == ChannelType.TELEGRAM and not channel_data.telegram_config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Se requiere telegram_config para canales de tipo Telegram"
        )

    # El canal web no requiere configuración adicional obligatoria

    # Asegurar que el bot_id coincide
    channel_data.bot_id = bot_id

    channel_service = get_channel_service()
    channel = await channel_service.create_channel(channel_data)

    # Agregar el canal al bot
    bot_service = get_bot_service()
    await bot_service.add_channel_to_bot(bot_id, channel.channel_id)

    return {
        "success": True,
        "message": "Canal creado exitosamente",
        "channel": channel.model_dump()
    }


@router.get("", response_model=dict)
async def get_channels(
    bot_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    channel_type: Optional[ChannelType] = Query(None),
    status: Optional[ChannelStatus] = Query(None),
    current_user: User = Depends(get_current_user)
):
    """Obtener canales de un bot"""
    await verify_bot_access(bot_id, current_user)

    channel_service = get_channel_service()
    skip = (page - 1) * limit

    result = await channel_service.get_channels_by_bot(
        bot_id=bot_id,
        skip=skip,
        limit=limit,
        channel_type=channel_type,
        status=status
    )

    return {
        "success": True,
        "channels": [c.model_dump() for c in result["channels"]],
        "total": result["total"],
        "page": result["page"],
        "pages": result["pages"],
        "limit": result["limit"]
    }


@router.get("/{channel_id}", response_model=dict)
async def get_channel(
    bot_id: str,
    channel_id: str,
    current_user: User = Depends(get_current_user)
):
    """Obtener un canal por ID"""
    await verify_bot_access(bot_id, current_user)

    channel_service = get_channel_service()
    channel = await channel_service.get_channel(channel_id)

    if not channel or channel.bot_id != bot_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Canal no encontrado"
        )

    return {
        "success": True,
        "channel": channel.model_dump()
    }


@router.put("/{channel_id}", response_model=dict)
async def update_channel(
    bot_id: str,
    channel_id: str,
    update_data: ChannelUpdate,
    current_user: User = Depends(get_current_user)
):
    """Actualizar un canal"""
    await verify_bot_access(bot_id, current_user)

    channel_service = get_channel_service()
    existing = await channel_service.get_channel(channel_id)

    if not existing or existing.bot_id != bot_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Canal no encontrado"
        )

    channel = await channel_service.update_channel(channel_id, update_data)

    return {
        "success": True,
        "message": "Canal actualizado",
        "channel": channel.model_dump()
    }


@router.post("/{channel_id}/activate", response_model=dict)
async def activate_channel(
    bot_id: str,
    channel_id: str,
    current_user: User = Depends(get_current_user)
):
    """Activar un canal. Para canales Telegram, registra el webhook automáticamente."""
    await verify_bot_access(bot_id, current_user)

    channel_service = get_channel_service()
    existing = await channel_service.get_channel(channel_id)

    if not existing or existing.bot_id != bot_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Canal no encontrado"
        )

    webhook_registered = False

    # For Web channels, just activate — no external webhook to register
    # For Telegram channels, register webhook with Telegram API
    if existing.channel_type == ChannelType.TELEGRAM and existing.telegram_config:
        try:
            telegram = create_telegram_service(
                bot_token=existing.telegram_config.bot_token,
                webhook_secret=existing.telegram_config.webhook_secret,
            )
            await telegram.set_webhook(existing.webhook_url)
            webhook_registered = True
        except Exception as e:
            logger.error(f"Error registering Telegram webhook for channel {channel_id}: {e}")
            await channel_service.set_channel_error(channel_id, f"Webhook registration failed: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Error registrando webhook en Telegram: {str(e)}"
            )

    activated = await channel_service.activate_channel(channel_id)

    if not activated:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al activar el canal"
        )

    result = {
        "success": True,
        "message": "Canal activado"
    }
    if webhook_registered:
        result["webhook_registered"] = True

    return result


@router.post("/{channel_id}/deactivate", response_model=dict)
async def deactivate_channel(
    bot_id: str,
    channel_id: str,
    current_user: User = Depends(get_current_user)
):
    """Desactivar un canal. Para canales Telegram, elimina el webhook."""
    await verify_bot_access(bot_id, current_user)

    channel_service = get_channel_service()
    existing = await channel_service.get_channel(channel_id)

    if not existing or existing.bot_id != bot_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Canal no encontrado"
        )

    # For Telegram channels, delete webhook from Telegram API
    if existing.channel_type == ChannelType.TELEGRAM and existing.telegram_config:
        try:
            telegram = create_telegram_service(
                bot_token=existing.telegram_config.bot_token,
                webhook_secret=existing.telegram_config.webhook_secret,
            )
            await telegram.delete_webhook()
        except Exception as e:
            logger.warning(f"Error deleting Telegram webhook for channel {channel_id}: {e}")

    deactivated = await channel_service.deactivate_channel(channel_id)

    if not deactivated:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al desactivar el canal"
        )

    return {
        "success": True,
        "message": "Canal desactivado"
    }


@router.get("/{channel_id}/qr-code")
async def get_channel_qr_code(
    bot_id: str,
    channel_id: str,
    base_url: str = Query(..., description="URL base de la app, p.ej. https://miapp.com"),
    current_user: User = Depends(get_current_user)
):
    """
    Genera un QR code PNG para el canal Web que apunta a la URL de chat del canal.
    Solo disponible para canales de tipo 'web'.
    """
    await verify_bot_access(bot_id, current_user)

    channel_service = get_channel_service()
    channel = await channel_service.get_channel(channel_id)

    if not channel or channel.bot_id != bot_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Canal no encontrado")

    if channel.channel_type not in (ChannelType.WEB, ChannelType.PWA):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El QR de canal solo está disponible para canales de tipo 'web' o 'pwa'"
        )

    chat_url = f"{base_url.rstrip('/')}/chat/c/{channel_id}"

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(chat_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    return Response(content=buf.read(), media_type="image/png")


@router.delete("/{channel_id}", response_model=dict)
async def delete_channel(
    bot_id: str,
    channel_id: str,
    current_user: User = Depends(get_current_user)
):
    """Eliminar un canal. Para canales Telegram activos, elimina el webhook primero."""
    await verify_bot_access(bot_id, current_user)

    channel_service = get_channel_service()
    existing = await channel_service.get_channel(channel_id)

    if not existing or existing.bot_id != bot_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Canal no encontrado"
        )

    # For Telegram channels, delete webhook before deleting channel
    if existing.channel_type == ChannelType.TELEGRAM and existing.telegram_config:
        try:
            telegram = create_telegram_service(
                bot_token=existing.telegram_config.bot_token,
                webhook_secret=existing.telegram_config.webhook_secret,
            )
            await telegram.delete_webhook()
        except Exception as e:
            logger.warning(f"Error deleting Telegram webhook for channel {channel_id}: {e}")

    deleted = await channel_service.delete_channel(channel_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al eliminar el canal"
        )

    # Eliminar el canal del bot
    bot_service = get_bot_service()
    await bot_service.remove_channel_from_bot(bot_id, channel_id)

    return {
        "success": True,
        "message": "Canal eliminado"
    }
