"""add destacado to clients

Revision ID: 25bb0e2c98d3
Revises: e71ac4d9f230
Create Date: 2026-07-16T23:14:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '25bb0e2c98d3'
down_revision: Union[str, None] = 'e71ac4d9f230'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'clients',
        sa.Column('destacado', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade() -> None:
    op.drop_column('clients', 'destacado')
