"""add color_semaforo and notas to prospects

Revision ID: 8f1c2a9d4b3e
Revises: 35eed6808a87
Create Date: 2026-07-12 15:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8f1c2a9d4b3e'
down_revision: Union[str, None] = '35eed6808a87'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('prospects', sa.Column('color_semaforo', sa.Text(), nullable=True))
    op.add_column('prospects', sa.Column('notas', sa.Text(), nullable=True))
    op.create_check_constraint(
        'ck_prospects_color_semaforo',
        'prospects',
        "color_semaforo IS NULL OR color_semaforo IN ('verde', 'amarillo', 'rojo')",
    )


def downgrade() -> None:
    op.drop_constraint('ck_prospects_color_semaforo', 'prospects', type_='check')
    op.drop_column('prospects', 'notas')
    op.drop_column('prospects', 'color_semaforo')
