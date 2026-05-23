"""
Connection Manager
Registro en memoria de conexiones WebSocket activas, keyed by conversation_id.
"""

from typing import Dict
from fastapi import WebSocket


class ConnectionManager:
    """Registra conexiones WebSocket activas por conversation_id."""

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


# Singleton compartido entre routers
connection_manager = ConnectionManager()
