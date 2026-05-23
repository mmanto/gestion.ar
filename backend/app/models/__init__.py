"""
Models module - Pydantic models for the application
"""

from .bot import (
    Bot,
    BotBase,
    BotCreate,
    BotUpdate,
    BotConfig,
    BotChannelConfig,
    BotStatus,
    BotChannel,
)
from .client import (
    Client,
    ClientBase,
    ClientCreate,
    ClientUpdate,
    ClientSource,
    ClientStatus,
)
from .channel import (
    Channel,
    ChannelBase,
    ChannelCreate,
    ChannelUpdate,
    ChannelType,
    ChannelStatus,
    WhatsAppConfig,
    TelegramConfig,
)

__all__ = [
    # Bot models
    "Bot",
    "BotBase",
    "BotCreate",
    "BotUpdate",
    "BotConfig",
    "BotChannelConfig",
    "BotStatus",
    "BotChannel",
    # Client models
    "Client",
    "ClientBase",
    "ClientCreate",
    "ClientUpdate",
    "ClientSource",
    "ClientStatus",
    # Channel models
    "Channel",
    "ChannelBase",
    "ChannelCreate",
    "ChannelUpdate",
    "ChannelType",
    "ChannelStatus",
    "WhatsAppConfig",
    "TelegramConfig",
]
