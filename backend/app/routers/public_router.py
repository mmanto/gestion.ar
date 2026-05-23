"""
Public Router - Endpoints públicos sin autenticación para páginas de clientes y PWA
"""

import io
import json
import os
from typing import Optional

import qrcode
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import Response

from app.services.channel_service import get_channel_service
from app.services.bot_service import get_bot_service
from app.services.user_service import get_user_service
from app.models.channel import ChannelStatus, ChannelType
from app.models.bot import BotStatus

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/app-url")
async def get_app_url(request: Request):
    """Devuelve la URL pública configurada (WEBHOOK_BASE_URL)."""
    url = os.getenv("WEBHOOK_BASE_URL", str(request.base_url).rstrip("/"))
    return {"url": url}


@router.get("/llm-info")
async def get_llm_info():
    """Devuelve el proveedor y modelo LLM activo."""
    provider = os.getenv("LLM_PROVIDER", "claude").lower()
    if provider == "ollama":
        model = os.getenv("OLLAMA_MODEL", "qcwind/qwen3-8b-instruct-Q4-K-M:latest")
    else:
        model = os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-20241022")
    return {"provider": provider, "model": model}


@router.get("/channels/{channel_id}")
async def get_public_channel_info(channel_id: str):
    """
    Obtiene información pública del canal y su bot.
    No expone datos sensibles (tokens, webhooks, etc.)
    """
    channel_service = get_channel_service()
    channel = await channel_service.get_channel(channel_id)

    if not channel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Canal no encontrado")

    if channel.status != ChannelStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Canal no disponible")

    bot_service = get_bot_service()
    bot = await bot_service.get_bot(channel.bot_id)

    if not bot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot no encontrado")

    return {
        "channel_id": channel.channel_id,
        "channel_type": channel.channel_type,
        "name": channel.name,
        "status": channel.status,
        "bot": {
            "bot_id": bot.bot_id,
            "name": bot.name,
            "description": bot.description,
            "business_type": bot.business_type,
        }
    }


@router.get("/channels/{channel_id}/qr-code")
async def get_public_qr_code(
    channel_id: str,
    request: Request,
    base_url: Optional[str] = None,
):
    """
    Genera un QR code PNG público para el canal.
    Si se provee base_url (ej. URL de ngrok), se usa esa; de lo contrario
    se detecta automáticamente del request.
    Solo disponible para canales web/pwa activos.
    """
    channel_service = get_channel_service()
    channel = await channel_service.get_channel(channel_id)

    if not channel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Canal no encontrado")

    if channel.status != ChannelStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Canal no disponible")

    if channel.channel_type not in (ChannelType.WEB, ChannelType.PWA):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="QR solo disponible para canales de tipo 'web' o 'pwa'"
        )

    effective_base = (base_url or str(request.base_url)).rstrip("/")
    chat_url = f"{effective_base}/chat/c/{channel_id}"

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


@router.get("/channels/{channel_id}/manifest.webmanifest")
async def get_channel_manifest(channel_id: str):
    """
    Genera un PWA manifest dinámico específico al canal/bot.
    Permite instalar el chat del cliente como una app independiente.
    """
    channel_service = get_channel_service()
    channel = await channel_service.get_channel(channel_id)

    if not channel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Canal no encontrado")

    bot_service = get_bot_service()
    bot = await bot_service.get_bot(channel.bot_id)

    if not bot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot no encontrado")

    short_name = bot.name[:12] if len(bot.name) > 12 else bot.name

    manifest = {
        "id": f"/chat/c/{channel_id}",
        "name": bot.name,
        "short_name": short_name,
        "description": bot.description or f"Chat con {bot.name}",
        "start_url": f"/chat/c/{channel_id}",
        "scope": "/chat/",
        "display": "standalone",
        "background_color": "#ffffff",
        "theme_color": "#4f46e5",
        "orientation": "portrait-primary",
        "icons": [
            {
                "src": "/icons/icon-192.png",
                "sizes": "192x192",
                "type": "image/png",
                "purpose": "any"
            },
            {
                "src": "/icons/icon-192.png",
                "sizes": "192x192",
                "type": "image/png",
                "purpose": "maskable"
            },
            {
                "src": "/icons/icon-512.png",
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "any"
            },
            {
                "src": "/icons/icon-512.png",
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "maskable"
            }
        ]
    }

    return Response(
        content=json.dumps(manifest),
        media_type="application/manifest+json",
        headers={"Cache-Control": "public, max-age=3600"}
    )


@router.get("/users/{username}")
async def get_public_user_info(username: str):
    """
    Retorna los bots activos del usuario con sus canales web/pwa activos.
    Usado para generar la página pública del usuario.
    """
    user_service = get_user_service()
    user = await user_service.get_user_by_username(username)

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    if user.disabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario no disponible")

    bot_service = get_bot_service()
    channel_service = get_channel_service()

    bots_result = await bot_service.get_bots_by_owner(
        owner_id=username,
        limit=50,
        status=BotStatus.ACTIVE
    )

    bots_data = []
    for bot in bots_result["bots"]:
        # Obtener canales web/pwa activos del bot
        web_channels = []
        for channel_type in (ChannelType.WEB, ChannelType.PWA):
            result = await channel_service.get_channels_by_bot(
                bot_id=bot.bot_id,
                channel_type=channel_type,
                status=ChannelStatus.ACTIVE,
                limit=10
            )
            for ch in result["channels"]:
                web_channels.append({
                    "channel_id": ch.channel_id,
                    "name": ch.name,
                    "channel_type": ch.channel_type,
                })

        if web_channels:
            bots_data.append({
                "bot_id": bot.bot_id,
                "name": bot.name,
                "description": bot.description,
                "business_type": bot.business_type,
                "web_channels": web_channels,
            })

    return {
        "username": username,
        "bots": bots_data,
    }
