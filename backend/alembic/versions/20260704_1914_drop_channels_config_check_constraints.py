"""drop channels config check constraints

Revision ID: 6ad0e3a3fbb5
Revises: fc013871679f
Create Date: 2026-07-04 19:14:20.369028+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6ad0e3a3fbb5'
down_revision: Union[str, None] = 'fc013871679f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Alembic autogenerate no detecta cambios de CheckConstraint de forma
    # confiable; se agregan a mano (ver ADR-006 / plan de migración: la lógica
    # de negocio real no exige *_config según channel_type de forma
    # consistente, y los 2 canales reales lo confirman).
    op.drop_constraint("ck_channels_whatsapp_config_present", "channels", type_="check")
    op.drop_constraint("ck_channels_telegram_config_present", "channels", type_="check")
    op.drop_constraint("ck_channels_web_config_present", "channels", type_="check")
    op.drop_constraint("ck_channels_pwa_config_present", "channels", type_="check")


def downgrade() -> None:
    op.create_check_constraint(
        "ck_channels_whatsapp_config_present", "channels",
        "channel_type != 'whatsapp' OR whatsapp_config IS NOT NULL",
    )
    op.create_check_constraint(
        "ck_channels_telegram_config_present", "channels",
        "channel_type != 'telegram' OR telegram_config IS NOT NULL",
    )
    op.create_check_constraint(
        "ck_channels_web_config_present", "channels",
        "channel_type != 'web' OR web_config IS NOT NULL",
    )
    op.create_check_constraint(
        "ck_channels_pwa_config_present", "channels",
        "channel_type != 'pwa' OR pwa_config IS NOT NULL",
    )
