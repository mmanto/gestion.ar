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
        endpoint=row.endpoint,
        p256dh=row.p256dh,
        auth=row.auth,
        user_agent=row.user_agent,
        is_active=row.is_active,
        created_at=row.created_at.isoformat(),
        last_used_at=row.last_used_at.isoformat() if row.last_used_at else None,
        expiration_time=row.expiration_time,
    )


class PushService:
    """Servicio para gestionar suscripciones push y envío de notificaciones VAPID"""

    def __init__(self):
        self.vapid_private_key = os.getenv("VAPID_PRIVATE_KEY", "").strip()
        self.vapid_public_key = os.getenv("VAPID_PUBLIC_KEY", "").strip()
        self.vapid_subject = os.getenv("VAPID_SUBJECT", "mailto:admin@example.com").strip()

        if not self.vapid_private_key or not self.vapid_public_key:
            print("⚠️  Push Service: VAPID_PRIVATE_KEY o VAPID_PUBLIC_KEY no configuradas.")
            print("   Para generarlas: python -c \"from py_vapid import Vapid; v=Vapid(); v.generate_keys(); print('VAPID_PUBLIC_KEY:', v.public_key); print('VAPID_PRIVATE_KEY:', v.private_key)\"")
        else:
            print("✅ Push Service (VAPID) inicializado correctamente")

    def get_vapid_public_key(self) -> str:
        """Retorna la clave pública VAPID para que el navegador la use en PushManager.subscribe()"""
        return self.vapid_public_key

    async def ensure_indexes(self):
        """No-op: los índices ya se crean vía migraciones Alembic (ver backend/alembic/versions/)."""
        pass

    async def save_subscription(self, data: PushSubscriptionCreate) -> PushSubscription:
        """
        Guarda una nueva suscripción push. Si el endpoint ya existe, actualiza is_active=True.

        Returns:
            PushSubscription guardada o actualizada
        """
        async with AsyncSessionLocal() as session:
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
                row.channel_id = data.channel_id
                row.bot_id = data.bot_id
                await session.commit()
                await session.refresh(row)
                return _to_push_subscription(row)

            subscription_id = f"sub_{uuid.uuid4().hex[:12]}"
            row = PushSubscriptionModel(
                subscription_id=subscription_id,
                bot_id=data.bot_id,
                channel_id=data.channel_id,
                client_id=None,
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
        """
        Envía una notificación push a una suscripción específica usando pywebpush.

        Returns:
            True si fue enviada exitosamente, False si falló
        """
        if not self.vapid_private_key or not self.vapid_public_key:
            print("⚠️  Push: No se puede enviar sin VAPID keys configuradas")
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
                vapid_claims={
                    "sub": self.vapid_subject,
                },
            )

            async with AsyncSessionLocal() as session:
                row = await session.get(PushSubscriptionModel, subscription.subscription_id)
                if row:
                    row.last_used_at = datetime.now(timezone.utc)
                    await session.commit()
            return True

        except Exception as e:
            error_str = str(e)
            # Si el endpoint devuelve 410 Gone, la suscripción ya no es válida
            if "410" in error_str or "404" in error_str:
                async with AsyncSessionLocal() as session:
                    row = await session.get(PushSubscriptionModel, subscription.subscription_id)
                    if row:
                        row.is_active = False
                        await session.commit()
            print(f"Error enviando push a {subscription.endpoint[:50]}...: {error_str[:100]}")
            return False

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
