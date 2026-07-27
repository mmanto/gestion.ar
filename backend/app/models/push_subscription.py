"""
PushSubscription models - Pydantic models for Push Notifications (multi-platform)
Soporta VAPID (PWA web), FCM (Android nativo), y APNs (iOS nativo).
"""

from typing import List, Optional
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
    """Payload para crear una nueva suscripción push.

    Soporta dos formatos según `platform`:
    - vapid: requiere `subscription` (endpoint + keys del navegador)
    - fcm / apns: requiere `device_token`
    - `user_id` y `client_id` son mutuamente excluyentes
    """
    platform: str = Field(default="vapid", description="vapid | fcm | apns")
    bot_id: Optional[str] = Field(None, description="ID del bot (se deriva del canal si no se proporciona)")
    channel_id: Optional[str] = Field(None, description="ID del canal (requerido para vapid, opcional para nativo)")
    # VAPID: objeto del navegador
    subscription: Optional[PushSubscriptionInfo] = Field(None, description="Suscripción del navegador (solo vapid)")
    # FCM / APNs
    device_token: Optional[str] = Field(None, description="Token de dispositivo FCM o APNs")
    # Propietario (mutuamente excluyentes)
    client_id: Optional[str] = Field(None, description="Cliente final (apps cliente)")
    user_id: Optional[str] = Field(None, description="Staff member (apps staff)")
    user_agent: Optional[str] = Field(None, description="User-Agent del dispositivo (para diagnóstico)")


class StaffPushSubscribeRequest(BaseModel):
    """Payload para que la app nativa del staff registre su push token.

    A diferencia de PushSubscriptionCreate (endpoint público), acá NO se
    acepta `user_id` del cliente — el router lo deriva siempre del JWT para
    que un usuario no pueda registrarse con el user_id de otro (ver
    POST /api/pwa/subscribe-staff en pwa_router.py).
    """
    platform: str = Field(..., description="fcm | apns")
    bot_id: str = Field(..., description="Bot cuyos mensajes de cliente quiere recibir el staff")
    device_token: str = Field(..., description="Token de dispositivo FCM o APNs")
    user_agent: Optional[str] = Field(None, description="Info del dispositivo (para diagnóstico)")


class PushSubscription(BaseModel):
    """Modelo completo de suscripción push almacenado en PostgreSQL"""
    subscription_id: str = Field(..., description="ID único, formato: sub_{hex12}")
    bot_id: str
    channel_id: Optional[str] = None
    client_id: Optional[str] = Field(None, description="Cliente vinculado")
    user_id: Optional[str] = Field(None, description="Staff vinculado (apps nativas)")
    platform: str = Field(default="vapid", description="vapid | fcm | apns")
    # VAPID
    endpoint: Optional[str] = Field(None, description="URL del servicio push (solo vapid)")
    p256dh: Optional[str] = None
    auth: Optional[str] = None
    # FCM / APNs
    device_token: Optional[str] = None
    user_agent: Optional[str] = None
    is_active: bool = True
    created_at: str
    last_used_at: Optional[str] = None
    expiration_time: Optional[int] = None


class SendNotificationRequest(BaseModel):
    """Payload para enviar una notificación push"""
    title: str = Field(..., description="Título de la notificación")
    body: str = Field(..., description="Cuerpo de la notificación")
    url: Optional[str] = Field(None, description="URL a abrir al hacer clic")
    icon: Optional[str] = Field(None, description="URL del icono")
    badge: Optional[str] = Field(None, description="URL del badge (Android)")
    client_id: Optional[str] = Field(None, description="Solo envía a suscripciones de ese cliente")
    channel_id: Optional[str] = Field(None, description="Solo envía a suscripciones de ese canal")
    # Staff targeting (apps nativas)
    user_id: Optional[str] = Field(None, description="Solo envía a suscripciones de ese staff member")
    user_ids: Optional[List[str]] = Field(None, description="Solo envía a suscripciones de esos staff members")


class NotificationResult(BaseModel):
    """Resultado del envío masivo de notificaciones"""
    sent: int = 0
    failed: int = 0
    errors: List[str] = Field(default_factory=list)
