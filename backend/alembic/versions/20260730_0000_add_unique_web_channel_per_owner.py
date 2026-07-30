"""add unique index for one web channel per (bot, owner)

Garantiza a lo sumo un canal web por (bot_id, owner_username) — antes no
había ninguna restricción y un admin podía crear (sin querer) varios
canales web para la misma persona. Ver channel_service.py
get_or_create_owner_web_channel y docs/dev/DECISIONS.md.

Antes de crear el índice, desasigna el owner (deja el canal como "general",
sin borrarlo) de los duplicados más nuevos por (bot_id, owner_username),
quedándose con el más antiguo — defensivo por si algún ambiente ya tiene
duplicados (verificado: 0 en dev al momento de esta migración).

Revision ID: ffd47ac84df6
Revises: 24abc427a41f
Create Date: 2026-07-30 00:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'ffd47ac84df6'
down_revision: Union[str, None] = '24abc427a41f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    connection = op.get_bind()

    duplicates = connection.execute(sa.text(
        """
        SELECT channel_id FROM (
            SELECT channel_id,
                   row_number() OVER (
                       PARTITION BY bot_id, owner_username
                       ORDER BY created_at ASC
                   ) AS rn
            FROM channels
            WHERE owner_username IS NOT NULL AND channel_type = 'web'
        ) ranked
        WHERE rn > 1
        """
    )).fetchall()

    if duplicates:
        ids = [row[0] for row in duplicates]
        print(f"[migration ffd47ac84df6] desasignando owner de {len(ids)} canal(es) web duplicado(s): {ids}")
        connection.execute(
            sa.text("UPDATE channels SET owner_username = NULL WHERE channel_id = ANY(:ids)"),
            {"ids": ids},
        )

    op.create_index(
        'uq_channels_bot_owner_web',
        'channels',
        ['bot_id', 'owner_username', 'channel_type'],
        unique=True,
        postgresql_where=sa.text("owner_username IS NOT NULL AND channel_type = 'web'"),
    )


def downgrade() -> None:
    op.drop_index('uq_channels_bot_owner_web', table_name='channels')
