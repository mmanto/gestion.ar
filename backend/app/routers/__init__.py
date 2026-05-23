"""
Routers module - API endpoints
"""

from .bot_router import router as bot_router
from .client_router import router as client_router
from .channel_router import router as channel_router

__all__ = [
    "bot_router",
    "client_router",
    "channel_router",
]
