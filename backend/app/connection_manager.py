"""
Connection Manager
Registro en memoria de conexiones WebSocket activas:
- Clientes: keyed by conversation_id
- Staff: keyed by (bot_id, user_id) para broadcast a admins/operadores
"""

from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import WebSocket


class ConnectionManager:
    """Registra conexiones WebSocket de clientes por conversation_id."""

    def __init__(self) -> None:
        self._connections: Dict[str, WebSocket] = {}

    def register(self, conversation_id: str, ws: WebSocket) -> None:
        self._connections[conversation_id] = ws

    def unregister(self, conversation_id: str) -> None:
        self._connections.pop(conversation_id, None)

    async def send_to_conversation(self, conversation_id: str, data: dict) -> bool:
        """
        Envía un mensaje JSON a la conexión activa de conversation_id.
        Retorna True si se envió, False si no hay conexión activa.
        """
        ws = self._connections.get(conversation_id)
        if ws is None:
            return False
        try:
            await ws.send_json(data)
            return True
        except Exception:
            self.unregister(conversation_id)
            return False


class StaffConnectionManager:
    """Registra conexiones WebSocket de staff (admins/operadores) por bot_id.

    Un mismo bot puede tener múltiples staff members conectados.
    """

    def __init__(self) -> None:
        # bot_id → {user_id: WebSocket}
        self._connections: Dict[str, Dict[str, WebSocket]] = {}

    def register(self, bot_id: str, user_id: str, ws: WebSocket) -> None:
        if bot_id not in self._connections:
            self._connections[bot_id] = {}
        self._connections[bot_id][user_id] = ws

    def unregister(self, bot_id: str, user_id: str) -> None:
        bot_conns = self._connections.get(bot_id)
        if bot_conns:
            bot_conns.pop(user_id, None)
            if not bot_conns:
                del self._connections[bot_id]

    async def broadcast_to_bot(
        self,
        bot_id: str,
        data: dict,
        exclude_user_id: str | None = None,
        allowed_usernames: Optional[List[str]] = None,
    ) -> int:
        """
        Envía un mensaje JSON a todos los staff members conectados a un bot.
        allowed_usernames: si se pasa, solo a esos usernames (ver
        UserService.get_notified_usernames — no todo el staff del bot ve
        mensajes de clientes de otros abogados). None = todos.
        Retorna la cantidad de destinatarios que recibieron el mensaje.
        """
        bot_conns = self._connections.get(bot_id)
        if not bot_conns:
            return 0

        sent = 0
        dead: list[str] = []
        for user_id, ws in bot_conns.items():
            if user_id == exclude_user_id:
                continue
            if allowed_usernames is not None and user_id not in allowed_usernames:
                continue
            try:
                await ws.send_json(data)
                sent += 1
            except Exception:
                dead.append(user_id)

        for user_id in dead:
            self.unregister(bot_id, user_id)

        return sent


# Singletons compartidos entre routers
connection_manager = ConnectionManager()
staff_connection_manager = StaffConnectionManager()


async def notify_staff_of_client_message(
    bot_id: str,
    conversation_id: str,
    client_id: str | None,
    client_label: str,
    content: str,
    channel: str = "web",
) -> None:
    """Notifica sobre un mensaje de cliente entrante: WS en tiempo real (staff
    con la app abierta) + push (staff en background/con la app cerrada).
    Compartido entre los canales Web, WhatsApp y Telegram.

    Si el cliente tiene owner_username (su propio canal/link, ver
    Channel.owner_username), solo se avisa al dueño + su broker + los admin
    del tenant — no a otros abogados del mismo bot (ver
    UserService.get_notified_usernames)."""
    from app.models.push_subscription import SendNotificationRequest
    from app.services.bot_service import get_bot_service
    from app.services.client_service import get_client_service
    from app.services.push_service import get_push_service
    from app.services.user_service import get_user_service

    allowed_usernames: Optional[List[str]] = None
    if client_id:
        client = await get_client_service().get_client(client_id)
        if client and client.owner_username:
            bot = await get_bot_service().get_bot(bot_id)
            if bot:
                allowed_usernames = await get_user_service().get_notified_usernames(
                    bot.tenant_id, client.owner_username
                )

    await staff_connection_manager.broadcast_to_bot(
        bot_id,
        {
            "type": "client_message",
            "conversation_id": conversation_id,
            "client_id": client_id,
            "client_name": client_label,
            "channel": channel,
            "content": content,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        allowed_usernames=allowed_usernames,
    )
    await get_push_service().broadcast_to_staff(
        bot_id,
        SendNotificationRequest(
            title=client_label,
            body=content[:140],
            url=f"/conversations/{conversation_id}",
            user_ids=allowed_usernames,
        ),
    )
