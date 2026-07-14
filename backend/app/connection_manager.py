"""
Connection Manager
Registro en memoria de conexiones WebSocket activas:
- Clientes: keyed by conversation_id
- Staff: keyed by (bot_id, user_id) para broadcast a admins/operadores
"""

from typing import Dict
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

    async def broadcast_to_bot(self, bot_id: str, data: dict, exclude_user_id: str | None = None) -> int:
        """
        Envía un mensaje JSON a todos los staff members conectados a un bot.
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
