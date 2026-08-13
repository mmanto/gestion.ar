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
from app.services.tenant_service import get_tenant_service
from app.models.channel import ChannelStatus, ChannelType
from app.models.bot import BotStatus
from app.models.tenant import TenantPublicInfo

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/tenants/{tenant_id}", response_model=TenantPublicInfo)
async def get_public_tenant_info(tenant_id: str):
    """
    Info pública de un tenant (sin PII) — usada por el frontend-tenant para
    pintar landing/login con la marca del tenant antes de autenticarse.
    """
    tenant = await get_tenant_service().get_tenant(tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant no encontrado")

    return TenantPublicInfo(
        tenant_id=tenant.tenant_id,
        name=tenant.name,
        status=tenant.status,
        branding=tenant.branding,
    )


@router.get("/app-url")
async def get_app_url(request: Request):
    """
    Devuelve la URL pública del frontend que originó la request.

    Cada tenant vive en su propio dominio (ver Fase 7 multi-tenant), así que
    no se puede usar un único FRONTEND_URL global — se deriva del Host real
    de la request (reenviado sin modificar por el nginx de cada tenant y por
    Traefik) para que el link de "Copiar link del chat" apunte al dominio
    del tenant que lo generó, no al panel admin.
    """
    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("host", request.url.netloc)
    return {"url": f"{scheme}://{host}"}


@router.get("/llm-info")
async def get_llm_info():
    """Devuelve el proveedor y modelo LLM activo."""
    provider = os.getenv("LLM_PROVIDER", "claude").lower()
    if provider == "ollama":
        model = os.getenv("OLLAMA_MODEL", "qcwind/qwen3-8b-instruct-Q4-K-M:latest")
    elif provider == "deepseek":
        model = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")
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
            # Si True, el chat del cliente arranca en blanco en cada carga de
            # página (el frontend usa una identidad de sesión nueva y el flujo
            # vuelve a pedir los datos del paciente/ciudadano). Ver
            # BotConfig.blank_chat_on_load.
            "blank_chat_on_load": bool(getattr(bot.config, "blank_chat_on_load", False)),
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

    bots_result = await bot_service.get_bots_by_tenant(
        tenant_id=user.tenant_id,
        limit=50,
        status=BotStatus.ACTIVE
    )

    bot_ids = [bot.bot_id for bot in bots_result["bots"]]
    channels_by_bot = await channel_service.get_active_web_channels_by_owner(bot_ids, username)

    bots_data = []
    for bot in bots_result["bots"]:
        # A lo sumo un canal web activo por (bot, username) — ver
        # uq_channels_bot_owner_web.
        channel = channels_by_bot.get(bot.bot_id)
        if not channel:
            continue

        bots_data.append({
            "bot_id": bot.bot_id,
            "name": bot.name,
            "description": bot.description,
            "business_type": bot.business_type,
            "web_channels": [{
                "channel_id": channel.channel_id,
                "name": channel.name,
                "channel_type": channel.channel_type,
            }],
        })

    return {
        "username": username,
        "bots": bots_data,
    }
