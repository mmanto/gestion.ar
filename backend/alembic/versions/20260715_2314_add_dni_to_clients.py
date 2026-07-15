"""add dni to clients

Revision ID: e71ac4d9f230
Revises: d2f8b6c4a917
Create Date: 2026-07-15T23:14:37.535202+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e71ac4d9f230'
down_revision: Union[str, None] = 'd2f8b6c4a917'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('clients', sa.Column('dni', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('clients', 'dni')
