"""
Push Service - Gestión de suscripciones Web Push con VAPID
Permite enviar notificaciones push al navegador sin depender de WhatsApp/Meta.
"""

import json
import logging
import os
import uuid
from datetime import datetime
from typing import Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorClient

from app.models.push_subscription import (
    PushSubscription,
    PushSubscriptionCreate,
    SendNotificationRequest,
    NotificationResult,
)

logger = logging.getLogger(__name__)


class PushService:
    """Servicio para gestionar suscripciones push y envío de notificaciones VAPID"""

    def __init__(self):
        self.mongodb_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017/gestionar")
        self.client = AsyncIOMotorClient(self.mongodb_uri)
        self.db = self.client.get_default_database()
        self.subscriptions = self.db.push_subscriptions

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
        """Crea los índices necesarios en la colección push_subscriptions"""
        await self.subscriptions.create_index("subscription_id", unique=True)
        await self.subscriptions.create_index("endpoint", unique=True)
        await self.subscriptions.create_index("bot_id")
        await self.subscriptions.create_index([("bot_id", 1), ("channel_id", 1)])
        await self.subscriptions.create_index([("bot_id", 1), ("is_active", 1)])
        await self.subscriptions.create_index("client_id", sparse=True)
        print("Push subscriptions indexes ensured")

    async def save_subscription(self, data: PushSubscriptionCreate) -> PushSubscription:
        """
        Guarda una nueva suscripción push. Si el endpoint ya existe, actualiza is_active=True.

        Returns:
            PushSubscription guardada o actualizada
        """
        now = datetime.utcnow().isoformat()
        existing = await self.subscriptions.find_one({"endpoint": data.subscription.endpoint})

        if existing:
            # Reactivar suscripción existente y actualizar datos
            await self.subscriptions.update_one(
                {"endpoint": data.subscription.endpoint},
                {"$set": {
                    "is_active": True,
                    "last_used_at": now,
                    "p256dh": data.subscription.keys.p256dh,
                    "auth": data.subscription.keys.auth,
                    "user_agent": data.user_agent,
                    "expiration_time": data.subscription.expirationTime,
                    "channel_id": data.channel_id,
                    "bot_id": data.bot_id,
                }}
            )
            existing = await self.subscriptions.find_one({"endpoint": data.subscription.endpoint})
            return PushSubscription(**{k: v for k, v in existing.items() if k != "_id"})

        subscription_id = f"sub_{uuid.uuid4().hex[:12]}"
        doc = {
            "subscription_id": subscription_id,
            "bot_id": data.bot_id,
            "channel_id": data.channel_id,
            "client_id": None,
            "endpoint": data.subscription.endpoint,
            "p256dh": data.subscription.keys.p256dh,
            "auth": data.subscription.keys.auth,
            "user_agent": data.user_agent,
            "is_active": True,
            "created_at": now,
            "last_used_at": now,
            "expiration_time": data.subscription.expirationTime,
        }
        await self.subscriptions.insert_one(doc)
        return PushSubscription(**{k: v for k, v in doc.items() if k != "_id"})

    async def deactivate_subscription(self, endpoint: str) -> bool:
        """Desactiva una suscripción por su endpoint"""
        result = await self.subscriptions.update_one(
            {"endpoint": endpoint},
            {"$set": {"is_active": False}}
        )
        return result.modified_count > 0

    async def delete_subscription_by_id(self, subscription_id: str) -> bool:
        """Elimina permanentemente una suscripción (acción admin)"""
        result = await self.subscriptions.delete_one({"subscription_id": subscription_id})
        return result.deleted_count > 0

    async def link_client(self, endpoint: str, client_id: str) -> bool:
        """Vincula una suscripción push a un cliente (usado en Fase 2)"""
        result = await self.subscriptions.update_one(
            {"endpoint": endpoint},
            {"$set": {"client_id": client_id}}
        )
        return result.modified_count > 0

    async def get_subscriptions_by_bot(
        self,
        bot_id: str,
        skip: int = 0,
        limit: int = 50,
        active_only: bool = True
    ) -> Dict:
        """Lista suscripciones de un bot con paginación"""
        query: Dict = {"bot_id": bot_id}
        if active_only:
            query["is_active"] = True

        total = await self.subscriptions.count_documents(query)
        cursor = self.subscriptions.find(query, {"_id": 0}).skip(skip).limit(limit)
        docs = await cursor.to_list(length=limit)

        return {
            "subscriptions": [PushSubscription(**d) for d in docs],
            "total": total,
            "active": total if active_only else None,
        }

    async def get_subscriptions_by_client(self, client_id: str) -> List[PushSubscription]:
        """Retorna todas las suscripciones activas de un cliente"""
        cursor = self.subscriptions.find(
            {"client_id": client_id, "is_active": True},
            {"_id": 0}
        )
        docs = await cursor.to_list(length=100)
        return [PushSubscription(**d) for d in docs]

    async def get_stats(self, bot_id: str) -> Dict:
        """Estadísticas de suscripciones de un bot"""
        total = await self.subscriptions.count_documents({"bot_id": bot_id})
        active = await self.subscriptions.count_documents({"bot_id": bot_id, "is_active": True})
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

            # Actualizar last_used_at
            await self.subscriptions.update_one(
                {"subscription_id": subscription.subscription_id},
                {"$set": {"last_used_at": datetime.utcnow().isoformat()}}
            )
            return True

        except Exception as e:
            error_str = str(e)
            # Si el endpoint devuelve 410 Gone, la suscripción ya no es válida
            if "410" in error_str or "404" in error_str:
                await self.subscriptions.update_one(
                    {"subscription_id": subscription.subscription_id},
                    {"$set": {"is_active": False}}
                )
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

        # Construir query
        query: Dict = {"bot_id": bot_id, "is_active": True}
        if request.client_id:
            query["client_id"] = request.client_id
        elif request.channel_id:
            query["channel_id"] = request.channel_id

        logger.info("Push broadcast query: %s", query)

        cursor = self.subscriptions.find(query, {"_id": 0})
        subs = await cursor.to_list(length=1000)

        logger.info("Push broadcast: encontradas %d suscripciones", len(subs))

        if not subs:
            return result

        payload = {
            "title": request.title,
            "body": request.body,
            "url": request.url or "/",
            "icon": request.icon or "/icons/icon-192.png",
            "badge": request.badge or "/icons/icon-192.png",
        }

        for sub_doc in subs:
            sub = PushSubscription(**sub_doc)
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
