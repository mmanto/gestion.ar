"""
Push Service - Gestión de suscripciones Web Push con VAPID en PostgreSQL
(ver ADR-006 en docs/dev/DECISIONS.md).
Permite enviar notificaciones push al navegador sin depender de WhatsApp/Meta.
"""

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from sqlalchemy import func, select

from app.db.database import AsyncSessionLocal
from app.db.models import PushSubscription as PushSubscriptionModel
from app.models.push_subscription import (
    NotificationResult,
    PushSubscription,
    PushSubscriptionCreate,
    SendNotificationRequest,
)

logger = logging.getLogger(__name__)




def _to_push_subscription(row: PushSubscriptionModel) -> PushSubscription:
    return PushSubscription(
        subscription_id=row.subscription_id,
        bot_id=row.bot_id,
        channel_id=row.channel_id,
        client_id=row.client_id,
        user_id=row.user_id,
        platform=row.platform,
        endpoint=row.endpoint,
        p256dh=row.p256dh,
        auth=row.auth,
        device_token=row.device_token,
        user_agent=row.user_agent,
        is_active=row.is_active,
        created_at=row.created_at.isoformat(),
        last_used_at=row.last_used_at.isoformat() if row.last_used_at else None,
        expiration_time=row.expiration_time,
    )


class PushService:
    """Servicio para gestionar suscripciones push y envío de notificaciones multi-plataforma.

    Soporta tres transportes:
    - vapid: Web Push Protocol (PWA web, RFC 8291/8292)
    - fcm: Firebase Cloud Messaging (Android nativo)
    - apns: Apple Push Notification service (iOS nativo)
    """

    def __init__(self):
        # ── VAPID (PWA web) ──
        self.vapid_private_key = os.getenv("VAPID_PRIVATE_KEY", "").strip()
        self.vapid_public_key = os.getenv("VAPID_PUBLIC_KEY", "").strip()
        self.vapid_subject = os.getenv("VAPID_SUBJECT", "mailto:admin@example.com").strip()

        if not self.vapid_private_key or not self.vapid_public_key:
            print("⚠️  Push Service: VAPID_PRIVATE_KEY o VAPID_PUBLIC_KEY no configuradas.")
            print("   Para generarlas: python -c \"from py_vapid import Vapid; v=Vapid(); v.generate_keys(); print('VAPID_PUBLIC_KEY:', v.public_key); print('VAPID_PRIVATE_KEY:', v.private_key)\"")
        else:
            print("✅ Push Service (VAPID) inicializado correctamente")

        # ── FCM (Android nativo) ──
        self._fcm_app = None
        fcm_credentials = os.getenv("FCM_CREDENTIALS_PATH", "").strip()
        if fcm_credentials and os.path.exists(fcm_credentials):
            try:
                import firebase_admin
                from firebase_admin import credentials
                cred = credentials.Certificate(fcm_credentials)
                self._fcm_app = firebase_admin.initialize_app(cred, name="gestion-ar-push")
                print("✅ Push Service (FCM) inicializado correctamente")
            except Exception as e:
                print(f"⚠️  Push Service: FCM init falló: {e}")
        else:
            print("⚠️  Push Service: FCM_CREDENTIALS_PATH no configurado. Push Android no disponible.")

        # ── APNs (iOS nativo, vía aioapns) ──
        self._apns_key_path = os.getenv("APNS_KEY_PATH", "").strip()
        self._apns_key_id = os.getenv("APNS_KEY_ID", "").strip()
        self._apns_team_id = os.getenv("APNS_TEAM_ID", "").strip()
        self._apns_topic = os.getenv("APNS_TOPIC", "").strip()
        self._apns_use_sandbox = os.getenv("APNS_USE_SANDBOX", "false").lower() == "true"
        self._apns_client = None  # lazy, se crea en el primer envío (ver _get_apns_client)

        if self._apns_key_path and os.path.exists(self._apns_key_path):
            print("✅ Push Service (APNs) configurado correctamente")
        else:
            print("⚠️  Push Service: APNS_KEY_PATH no configurado. Push iOS no disponible.")

    def get_vapid_public_key(self) -> str:
        """Retorna la clave pública VAPID para que el navegador la use en PushManager.subscribe()"""
        return self.vapid_public_key

    async def ensure_indexes(self):
        """No-op: los índices ya se crean vía migraciones Alembic."""
        pass

    async def save_subscription(self, data: PushSubscriptionCreate) -> PushSubscription:
        """Guarda una nueva suscripción push (VAPID o nativa).

        Para VAPID: busca por endpoint único, actualiza si ya existe.
        Para nativo (FCM/APNs): busca por device_token único, actualiza si ya existe.
        """
        async with AsyncSessionLocal() as session:
            if data.platform == "vapid":
                return await self._save_vapid_subscription(session, data)
            return await self._save_native_subscription(session, data)

    async def _save_vapid_subscription(self, session, data: PushSubscriptionCreate) -> PushSubscription:
        if not data.subscription:
            raise ValueError("subscription es requerido para platform=vapid")

        result = await session.execute(
            select(PushSubscriptionModel).where(
                PushSubscriptionModel.endpoint == data.subscription.endpoint
            )
        )
        row = result.scalars().first()

        if row:
            row.is_active = True
            row.last_used_at = datetime.now(timezone.utc)
            row.p256dh = data.subscription.keys.p256dh
            row.auth = data.subscription.keys.auth
            row.user_agent = data.user_agent
            row.expiration_time = data.subscription.expirationTime
            row.channel_id = data.channel_id or row.channel_id
            row.bot_id = data.bot_id or row.bot_id
            await session.commit()
            await session.refresh(row)
            return _to_push_subscription(row)

        subscription_id = f"sub_{uuid.uuid4().hex[:12]}"
        row = PushSubscriptionModel(
            subscription_id=subscription_id,
            bot_id=data.bot_id,
            channel_id=data.channel_id,
            client_id=data.client_id,
            user_id=None,
            platform="vapid",
            endpoint=data.subscription.endpoint,
            p256dh=data.subscription.keys.p256dh,
            auth=data.subscription.keys.auth,
            user_agent=data.user_agent,
            is_active=True,
            expiration_time=data.subscription.expirationTime,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return _to_push_subscription(row)

    async def _save_native_subscription(self, session, data: PushSubscriptionCreate) -> PushSubscription:
        if not data.device_token:
            raise ValueError("device_token es requerido para platform=fcm|apns")
        if data.user_id and data.client_id:
            raise ValueError("user_id y client_id son mutuamente excluyentes")

        result = await session.execute(
            select(PushSubscriptionModel).where(
                PushSubscriptionModel.device_token == data.device_token
            )
        )
        row = result.scalars().first()

        if row:
            row.is_active = True
            row.last_used_at = datetime.now(timezone.utc)
            row.platform = data.platform
            row.bot_id = data.bot_id or row.bot_id
            row.channel_id = data.channel_id or row.channel_id
            row.user_id = data.user_id or row.user_id
            row.client_id = data.client_id or row.client_id
            await session.commit()
            await session.refresh(row)
            return _to_push_subscription(row)

        subscription_id = f"sub_{uuid.uuid4().hex[:12]}"
        row = PushSubscriptionModel(
            subscription_id=subscription_id,
            bot_id=data.bot_id,
            channel_id=data.channel_id,
            client_id=data.client_id,
            user_id=data.user_id,
            platform=data.platform,
            device_token=data.device_token,
            user_agent=data.user_agent,
            is_active=True,
        )
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return _to_push_subscription(row)

    async def deactivate_subscription(self, endpoint: str) -> bool:
        """Desactiva una suscripción por su endpoint"""
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(PushSubscriptionModel).where(PushSubscriptionModel.endpoint == endpoint)
            )
            row = result.scalars().first()
            if not row:
                return False
            row.is_active = False
            await session.commit()
            return True

    async def delete_subscription_by_id(self, subscription_id: str) -> bool:
        """Elimina permanentemente una suscripción (acción admin)"""
        async with AsyncSessionLocal() as session:
            row = await session.get(PushSubscriptionModel, subscription_id)
            if not row:
                return False
            await session.delete(row)
            await session.commit()
            return True

    async def link_client(self, endpoint: str, client_id: str) -> bool:
        """Vincula una suscripción push a un cliente (usado en Fase 2)"""
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(PushSubscriptionModel).where(PushSubscriptionModel.endpoint == endpoint)
            )
            row = result.scalars().first()
            if not row:
                return False
            row.client_id = client_id
            await session.commit()
            return True

    async def get_subscriptions_by_bot(
        self,
        bot_id: str,
        skip: int = 0,
        limit: int = 50,
        active_only: bool = True
    ) -> Dict:
        """Lista suscripciones de un bot con paginación"""
        filters = [PushSubscriptionModel.bot_id == bot_id]
        if active_only:
            filters.append(PushSubscriptionModel.is_active.is_(True))

        async with AsyncSessionLocal() as session:
            total = (await session.execute(
                select(func.count()).select_from(PushSubscriptionModel).where(*filters)
            )).scalar_one()

            result = await session.execute(
                select(PushSubscriptionModel).where(*filters).offset(skip).limit(limit)
            )
            rows = result.scalars().all()

        return {
            "subscriptions": [_to_push_subscription(r) for r in rows],
            "total": total,
            "active": total if active_only else None,
        }

    async def get_subscriptions_by_client(self, client_id: str) -> List[PushSubscription]:
        """Retorna todas las suscripciones activas de un cliente"""
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(PushSubscriptionModel)
                .where(
                    PushSubscriptionModel.client_id == client_id,
                    PushSubscriptionModel.is_active.is_(True),
                )
                .limit(100)
            )
            rows = result.scalars().all()
        return [_to_push_subscription(r) for r in rows]

    async def get_stats(self, bot_id: str) -> Dict:
        """Estadísticas de suscripciones de un bot"""
        async with AsyncSessionLocal() as session:
            total = (await session.execute(
                select(func.count()).select_from(PushSubscriptionModel)
                .where(PushSubscriptionModel.bot_id == bot_id)
            )).scalar_one()
            active = (await session.execute(
                select(func.count()).select_from(PushSubscriptionModel)
                .where(PushSubscriptionModel.bot_id == bot_id, PushSubscriptionModel.is_active.is_(True))
            )).scalar_one()

        return {"total_subscriptions": total, "active_subscriptions": active}


    async def send_notification(self, subscription: PushSubscription, payload: dict) -> bool:
        """Envía una notificación push routeando por platform.

        Returns:
            True si fue enviada exitosamente, False si falló
        """
        platform = subscription.platform or "vapid"
        if platform == "fcm":
            return await self._send_fcm(subscription, payload)
        if platform == "apns":
            return await self._send_apns(subscription, payload)
        return await self._send_vapid(subscription, payload)

    async def _send_vapid(self, subscription: PushSubscription, payload: dict) -> bool:
        if not self.vapid_private_key or not self.vapid_public_key:
            print("⚠️  Push: No se puede enviar sin VAPID keys configuradas")
            return False

        if not subscription.endpoint or not subscription.p256dh or not subscription.auth:
            print(f"⚠️  Push: suscripción VAPID incompleta {subscription.subscription_id}")
            return False

        try:
            from pywebpush import webpush

            subscription_info = {
                "endpoint": subscription.endpoint,
                "keys": {
                    "p256dh": subscription.p256dh,
                    "auth": subscription.auth,
                }
            }

            webpush(
                subscription_info=subscription_info,
                data=json.dumps(payload),
                vapid_private_key=self.vapid_private_key,
                vapid_claims={"sub": self.vapid_subject},
            )

            await self._touch_last_used(subscription.subscription_id)
            return True

        except Exception as e:
            error_str = str(e)
            if "410" in error_str or "404" in error_str:
                await self._deactivate(subscription.subscription_id)
            print(f"Error enviando push VAPID a {subscription.endpoint[:50] if subscription.endpoint else '?'}...: {error_str[:100]}")
            return False

    async def _send_fcm(self, subscription: PushSubscription, payload: dict) -> bool:
        if not self._fcm_app:
            print("⚠️  Push: FCM no inicializado")
            return False
        if not subscription.device_token:
            print("⚠️  Push: suscripción FCM sin device_token")
            return False

        try:
            from firebase_admin import messaging

            message = messaging.Message(
                token=subscription.device_token,
                notification=messaging.Notification(
                    title=payload.get("title", ""),
                    body=payload.get("body", ""),
                ),
                data={
                    "url": payload.get("url", "/"),
                },
            )

            response = messaging.send(message)
            print(f"✅ FCM enviado: {response}")
            await self._touch_last_used(subscription.subscription_id)
            return True

        except Exception as e:
            error_str = str(e)
            if "UNREGISTERED" in error_str or "INVALID_ARGUMENT" in error_str or "NOT_FOUND" in error_str:
                await self._deactivate(subscription.subscription_id)
            print(f"Error enviando push FCM: {error_str[:100]}")
            return False

    def _get_apns_client(self):
        """Crea (una sola vez) el cliente aioapns, reutilizado entre envíos."""
        if self._apns_client is None:
            from aioapns import APNs

            with open(self._apns_key_path) as f:
                key_content = f.read()

            self._apns_client = APNs(
                key=key_content,
                key_id=self._apns_key_id,
                team_id=self._apns_team_id,
                topic=self._apns_topic,
                use_sandbox=self._apns_use_sandbox,
            )
        return self._apns_client

    async def _send_apns(self, subscription: PushSubscription, payload: dict) -> bool:
        if not self._apns_key_path or not os.path.exists(self._apns_key_path):
            print("⚠️  Push: APNs no configurado")
            return False
        if not subscription.device_token:
            print("⚠️  Push: suscripción APNs sin device_token")
            return False

        try:
            from aioapns import NotificationRequest

            alert = {}
            if payload.get("title"):
                alert["title"] = payload["title"]
            if payload.get("body"):
                alert["body"] = payload["body"]

            request = NotificationRequest(
                device_token=subscription.device_token,
                message={
                    "aps": {
                        "alert": alert or None,
                        "badge": 1,
                        "sound": "default",
                    },
                    "url": payload.get("url", "/"),
                },
            )

            result = await self._get_apns_client().send_notification(request)
            if not result.is_successful:
                reason = result.description or ""
                if "Unregistered" in reason or "BadDeviceToken" in reason:
                    await self._deactivate(subscription.subscription_id)
                print(f"Error enviando push APNs: {reason[:100]}")
                return False

            await self._touch_last_used(subscription.subscription_id)
            return True

        except Exception as e:
            print(f"Error enviando push APNs: {str(e)[:100]}")
            return False

    async def _touch_last_used(self, subscription_id: str) -> None:
        async with AsyncSessionLocal() as session:
            row = await session.get(PushSubscriptionModel, subscription_id)
            if row:
                row.last_used_at = datetime.now(timezone.utc)
                await session.commit()

    async def _deactivate(self, subscription_id: str) -> None:
        async with AsyncSessionLocal() as session:
            row = await session.get(PushSubscriptionModel, subscription_id)
            if row:
                row.is_active = False
                await session.commit()

    async def broadcast_to_bot(
        self,
        bot_id: str,
        request: SendNotificationRequest,
    ) -> NotificationResult:
        """
        Envía una notificación push a todos los suscriptores activos de un bot.
        Si client_id está especificado, solo envía a las suscripciones de ese cliente.
        """
        result = NotificationResult()

        filters = [PushSubscriptionModel.bot_id == bot_id, PushSubscriptionModel.is_active.is_(True)]
        if request.client_id:
            filters.append(PushSubscriptionModel.client_id == request.client_id)
        elif request.channel_id:
            filters.append(PushSubscriptionModel.channel_id == request.channel_id)

        logger.info("Push broadcast filters: bot_id=%s client_id=%s channel_id=%s", bot_id, request.client_id, request.channel_id)

        async with AsyncSessionLocal() as session:
            db_result = await session.execute(
                select(PushSubscriptionModel).where(*filters).limit(1000)
            )
            rows = db_result.scalars().all()

        logger.info("Push broadcast: encontradas %d suscripciones", len(rows))

        if not rows:
            return result

        payload = {
            "title": request.title,
            "body": request.body,
            "url": request.url or "/",
            "icon": request.icon or "/icons/icon-192.png",
            "badge": request.badge or "/icons/icon-192.png",
        }

        for row in rows:
            sub = _to_push_subscription(row)
            success = await self.send_notification(sub, payload)
            if success:
                result.sent += 1
            else:
                result.failed += 1
                result.errors.append(sub.endpoint[:60])

        return result


# Singleton
_push_service_instance: Optional[PushService] = None


def get_push_service() -> PushService:
    global _push_service_instance
    if _push_service_instance is None:
        _push_service_instance = PushService()
    return _push_service_instance
