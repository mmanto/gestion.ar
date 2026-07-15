"""
Client Service - CRUD operations for clients in PostgreSQL (ver ADR-006 en docs/dev/DECISIONS.md)
"""

import math
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from sqlalchemy import func, or_, select

from app.db.database import AsyncSessionLocal
from app.db.models import Bot as BotModel, Client as ClientModel
from app.models.client import Client, ClientCreate, ClientSource, ClientStatus, ClientUpdate, estado_from_color


def calculate_score(total_messages: int, first_contact_at: str) -> float:
    """
    Calcula el score del cliente (0-100) basado en:
    - Mensajes totales (0-60 pts): logarítmico, satura en ~1000 mensajes
    - Frecuencia de contacto (0-40 pts): mensajes/día, satura en 10 msgs/día
    """
    msg_score = min(60.0, math.log10(total_messages + 1) / 3.0 * 60.0)

    try:
        first_dt = datetime.fromisoformat(first_contact_at)
        days = max(1, (datetime.utcnow() - first_dt).days + 1)
    except (ValueError, TypeError):
        days = 1

    msgs_per_day = total_messages / days
    freq_score = min(40.0, msgs_per_day / 10.0 * 40.0)

    return round(msg_score + freq_score, 2)


def _to_client(row: ClientModel) -> Client:
    return Client(
        client_id=row.client_id,
        bot_id=row.bot_id,
        external_id=row.external_id,
        source=row.source,
        name=row.name,
        email=row.email,
        phone=row.phone,
        dni=row.dni,
        status=row.status,
        first_contact_at=row.first_contact_at.isoformat(),
        last_contact_at=row.last_contact_at.isoformat(),
        total_conversations=row.total_conversations,
        total_messages=row.total_messages,
        total_tokens_used=row.total_tokens_used,
        score=float(row.score),
        metadata=row.metadata_,
        estado=estado_from_color(row.color_semaforo),
        color_semaforo=row.color_semaforo,
        notas=row.notas,
    )


class ClientService:
    """Servicio para gestionar clientes en PostgreSQL"""

    async def ensure_indexes(self):
        """No-op: los índices ya se crean vía migraciones Alembic (ver backend/alembic/versions/)."""
        pass

    async def create_client(self, client_data: ClientCreate) -> Client:
        """Crea un nuevo cliente"""
        client_id = f"client_{uuid.uuid4().hex[:12]}"

        async with AsyncSessionLocal() as session:
            # Resolver tenant_id desde el bot (requerido por la FK NOT NULL)
            bot_result = await session.execute(
                select(BotModel.tenant_id).where(BotModel.bot_id == client_data.bot_id)
            )
            tenant_id = bot_result.scalars().first()

            row = ClientModel(
                client_id=client_id,
                tenant_id=tenant_id,
                bot_id=client_data.bot_id,
                external_id=client_data.external_id,
                source=client_data.source.value if hasattr(client_data.source, 'value') else client_data.source,
                name=client_data.name,
                email=client_data.email,
                phone=client_data.phone,
                dni=client_data.dni,
                status=ClientStatus.ACTIVE.value,
                total_conversations=0,
                total_messages=0,
                total_tokens_used=0,
                score=0.0,
                metadata_=client_data.metadata or {},
            )
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return _to_client(row)

    async def get_client(self, client_id: str) -> Optional[Client]:
        """Obtiene un cliente por ID"""
        async with AsyncSessionLocal() as session:
            row = await session.get(ClientModel, client_id)
            return _to_client(row) if row else None

    async def get_client_by_external_id(
        self,
        bot_id: str,
        external_id: str
    ) -> Optional[Client]:
        """Obtiene cliente por bot_id y external_id"""
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(ClientModel).where(
                    ClientModel.bot_id == bot_id,
                    ClientModel.external_id == external_id,
                )
            )
            row = result.scalars().first()
            return _to_client(row) if row else None

    async def get_or_create_client(
        self,
        bot_id: str,
        external_id: str,
        source: str,
        metadata: Optional[Dict] = None
    ) -> Client:
        """Obtiene o crea un cliente"""
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(ClientModel).where(
                    ClientModel.bot_id == bot_id,
                    ClientModel.external_id == external_id,
                )
            )
            row = result.scalars().first()
            if row:
                row.last_contact_at = datetime.now(timezone.utc)
                await session.commit()
                await session.refresh(row)
                return _to_client(row)

        # Crear nuevo cliente
        source_enum = ClientSource(source) if source in [e.value for e in ClientSource] else ClientSource.MANUAL
        client_data = ClientCreate(
            bot_id=bot_id,
            external_id=external_id,
            source=source_enum,
            metadata=metadata
        )
        return await self.create_client(client_data)

    async def _query_clients(
        self,
        base_filters: list,
        skip: int,
        limit: int,
        status: Optional[ClientStatus],
        search: Optional[str],
        color_semaforo: Optional[str] = None,
    ) -> Dict:
        filters = list(base_filters)
        if status:
            filters.append(ClientModel.status == status.value)
        if search:
            pattern = f"%{search}%"
            filters.append(or_(
                ClientModel.name.ilike(pattern),
                ClientModel.external_id.ilike(pattern),
                ClientModel.email.ilike(pattern),
                ClientModel.phone.ilike(pattern),
                ClientModel.dni.ilike(pattern),
            ))
        if color_semaforo == "sin_clasificar":
            filters.append(ClientModel.color_semaforo.is_(None))
        elif color_semaforo:
            filters.append(ClientModel.color_semaforo == color_semaforo)

        async with AsyncSessionLocal() as session:
            total = (await session.execute(
                select(func.count()).select_from(ClientModel).where(*filters)
            )).scalar_one()

            result = await session.execute(
                select(ClientModel)
                .where(*filters)
                .order_by(ClientModel.score.desc(), ClientModel.last_contact_at.desc())
                .offset(skip)
                .limit(limit)
            )
            rows = result.scalars().all()

        return {
            "clients": [_to_client(r) for r in rows],
            "total": total,
            "page": (skip // limit) + 1 if limit > 0 else 1,
            "pages": (total + limit - 1) // limit if limit > 0 else 0,
            "limit": limit
        }

    async def get_clients_by_bot(
        self,
        bot_id: str,
        skip: int = 0,
        limit: int = 20,
        status: Optional[ClientStatus] = None,
        search: Optional[str] = None,
        color_semaforo: Optional[str] = None,
    ) -> Dict:
        """Obtiene clientes de un bot con paginación y filtros"""
        return await self._query_clients([ClientModel.bot_id == bot_id], skip, limit, status, search, color_semaforo)

    async def get_clients_by_bot_ids(
        self,
        bot_ids: List[str],
        skip: int = 0,
        limit: int = 20,
        status: Optional[ClientStatus] = None,
        search: Optional[str] = None,
        color_semaforo: Optional[str] = None,
    ) -> Dict:
        """Obtiene clientes de múltiples bots con paginación y filtros"""
        return await self._query_clients([ClientModel.bot_id.in_(bot_ids)], skip, limit, status, search, color_semaforo)

    async def count_clients_by_color(self, bot_ids: List[str]) -> Dict[str, int]:
        """Cuenta clientes de varios bots agrupados por color_semaforo (embudo de ventas)."""
        counts = {"verde": 0, "amarillo": 0, "rojo": 0, "sin_clasificar": 0}
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(ClientModel.color_semaforo, func.count())
                .where(ClientModel.bot_id.in_(bot_ids))
                .group_by(ClientModel.color_semaforo)
            )
            for color, count in result.all():
                counts[color or "sin_clasificar"] = count
        return counts

    async def update_client(self, client_id: str, update_data: ClientUpdate) -> Optional[Client]:
        """Actualiza un cliente"""
        update_dict = {}
        for key, value in update_data.model_dump(exclude_unset=True).items():
            if value is None:
                continue
            if key == "status":
                update_dict["status"] = value.value if hasattr(value, "value") else value
            elif key == "metadata":
                update_dict["metadata_"] = value
            else:
                update_dict[key] = value

        async with AsyncSessionLocal() as session:
            row = await session.get(ClientModel, client_id)
            if not row:
                return None

            if not update_dict:
                return _to_client(row)

            # Si se actualiza el score manualmente, se usa tal cual (sin recalcular)
            update_dict["last_contact_at"] = datetime.now(timezone.utc)
            for k, v in update_dict.items():
                setattr(row, k, v)

            await session.commit()
            await session.refresh(row)
            return _to_client(row)

    async def increment_counters(
        self,
        client_id: str,
        conversations: int = 0,
        messages: int = 0,
        tokens: int = 0
    ):
        """Incrementa contadores del cliente y recalcula el score automáticamente"""
        async with AsyncSessionLocal() as session:
            row = await session.get(ClientModel, client_id)
            if not row:
                return

            if conversations:
                row.total_conversations += conversations
            if messages:
                row.total_messages += messages
            if tokens:
                row.total_tokens_used += tokens
            row.last_contact_at = datetime.now(timezone.utc)

            if messages != 0:
                row.score = calculate_score(row.total_messages, row.first_contact_at.isoformat())

            await session.commit()

    async def block_client(self, client_id: str) -> bool:
        """Bloquea un cliente"""
        async with AsyncSessionLocal() as session:
            row = await session.get(ClientModel, client_id)
            if not row:
                return False
            row.status = ClientStatus.BLOCKED.value
            row.last_contact_at = datetime.now(timezone.utc)
            await session.commit()
            return True

    async def unblock_client(self, client_id: str) -> bool:
        """Desbloquea un cliente"""
        async with AsyncSessionLocal() as session:
            row = await session.get(ClientModel, client_id)
            if not row:
                return False
            row.status = ClientStatus.ACTIVE.value
            row.last_contact_at = datetime.now(timezone.utc)
            await session.commit()
            return True


# Singleton
_client_service: Optional[ClientService] = None


def get_client_service() -> ClientService:
    """Obtiene la instancia singleton del servicio de clientes"""
    global _client_service
    if _client_service is None:
        _client_service = ClientService()
    return _client_service
