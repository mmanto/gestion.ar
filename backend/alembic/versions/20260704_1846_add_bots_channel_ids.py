"""add bots channel_ids

Revision ID: fc013871679f
Revises: 9c500f6cc24d
Create Date: 2026-07-04 18:46:07.920898+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'fc013871679f'
down_revision: Union[str, None] = '9c500f6cc24d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nota: autogenerate también detectó un cambio cosmético en
    # ix_channels_twilio_phone_number (Postgres normaliza el texto de la
    # expresión distinto a como SQLAlchemy la genera) — no es un cambio real,
    # se omite para no tocar ese índice sin necesidad.
    op.add_column('bots', sa.Column('channel_ids', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False))


def downgrade() -> None:
    op.drop_column('bots', 'channel_ids')
