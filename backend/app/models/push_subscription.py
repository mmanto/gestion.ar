"""
PushSubscription models - Pydantic models for Web Push (VAPID) subscriptions
Almacena las suscripciones push del navegador, scoped por bot_id.
"""

from typing import Optional
from pydantic import BaseModel, Field


class PushSubscriptionKeys(BaseModel):
    """Claves criptográficas de la suscripción push del navegador"""
    p256dh: str = Field(..., description="Public key del navegador (Base64 URL-safe)")
    auth: str = Field(..., description="Auth secret (Base64 URL-safe)")


class PushSubscriptionInfo(BaseModel):
    """Objeto de suscripción tal como lo devuelve PushManager.subscribe() del navegador"""
    endpoint: str = Field(..., description="URL del servicio push del navegador")
    keys: PushSubscriptionKeys
    expirationTime: Optional[int] = Field(None, description="Timestamp de expiración (ms), null si no expira")


class PushSubscriptionCreate(BaseModel):
    """Payload para crear una nueva suscripción push (POST /api/pwa/subscribe)"""
    bot_id: Optional[str] = Field(None, description="ID del bot (se deriva del canal si no se proporciona)")
    channel_id: str = Field(..., description="ID del canal PWA")
    subscription: PushSubscriptionInfo
    user_agent: Optional[str] = Field(None, description="User-Agent del navegador (para diagnóstico)")


class PushSubscription(BaseModel):
    """Modelo completo de suscripción push almacenado en MongoDB"""
    subscription_id: str = Field(..., description="ID único, formato: sub_{hex12}")
    bot_id: str
    channel_id: str
    client_id: Optional[str] = Field(None, description="Cliente vinculado (se llena en Fase 2)")
    endpoint: str = Field(..., description="URL única del servicio push")
    p256dh: str
    auth: str
    user_agent: Optional[str] = None
    is_active: bool = True
    created_at: str
    last_used_at: Optional[str] = None
    expiration_time: Optional[int] = None


class SendNotificationRequest(BaseModel):
    """Payload para enviar una notificación push (POST /api/pwa/{bot_id}/send-notification)"""
    title: str = Field(..., description="Título de la notificación")
    body: str = Field(..., description="Cuerpo de la notificación")
    url: Optional[str] = Field(None, description="URL a abrir al hacer clic (relativa o absoluta)")
    icon: Optional[str] = Field(None, description="URL del icono de la notificación")
    badge: Optional[str] = Field(None, description="URL del badge (Android)")
    client_id: Optional[str] = Field(None, description="Si se especifica, solo envía a suscripciones de ese cliente")
    channel_id: Optional[str] = Field(None, description="Si se especifica, solo envía a suscripciones de ese canal")


class NotificationResult(BaseModel):
    """Resultado del envío masivo de notificaciones"""
    sent: int = 0
    failed: int = 0
    errors: list = Field(default_factory=list)
