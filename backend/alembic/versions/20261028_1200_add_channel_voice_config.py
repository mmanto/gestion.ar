"""add channel voice config (Deepgram Agent, canal de voz)

Habilita `channels.channel_type='voice'` con su configuración (modelo STT,
idioma y voz Aura) en `channels.voice_config`. El prompt, las tools y la key
de Deepgram los arma el backend en `voice_session_service.py`; el cliente
(APK/PWA) solo transporta audio.

Aditivo: ningún canal existente cambia de comportamiento.

Revision ID: c3f8a2b6d741
Revises: b2e7f4a91c05
Create Date: 2026-10-28 12:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'c3f8a2b6d741'
down_revision: Union[str, None] = 'b2e7f4a91c05'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('channels', sa.Column('voice_config', postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column('channels', 'voice_config')
