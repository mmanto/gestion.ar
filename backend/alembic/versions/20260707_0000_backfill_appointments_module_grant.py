"""backfill appointments module grant for bots with legacy enabled_in_chat

Revision ID: a1f3c9d02b4e
Revises: 756beb610685
Create Date: 2026-07-07 00:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a1f3c9d02b4e'
down_revision: Union[str, None] = '756beb610685'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # La reserva de turnos por chat pasa a gatearse por el módulo "appointments"
    # (bot_modules.enabled) en vez del flag bot.metadata['appointments']
    # ['enabled_in_chat']. Sin este backfill, los bots que ya tenían la reserva
    # activa (ej. ERMA) perderían la funcionalidad de un día para el otro al
    # no tener el módulo otorgado/habilitado.
    op.execute(
        """
        INSERT INTO bot_modules (bot_id, module_key, granted, enabled, granted_at)
        SELECT bot_id, 'appointments', true, true, now()
        FROM bots
        WHERE (metadata -> 'appointments' ->> 'enabled_in_chat') = 'true'
        ON CONFLICT (bot_id, module_key) DO UPDATE
        SET granted = true, enabled = true
        """
    )


def downgrade() -> None:
    pass
