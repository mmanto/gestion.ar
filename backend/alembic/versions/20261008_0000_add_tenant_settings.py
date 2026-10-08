"""add tenant settings JSONB

Revision ID: f3a1b7c9d2e4
Revises: 6d1e4b5c8a9f
Create Date: 2026-10-08 00:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'f3a1b7c9d2e4'
down_revision: Union[str, None] = '6d1e4b5c8a9f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Flags de runtime por tenant (p. ej. {"stats_two_cols_mobile": true})
    # que antes se inyectaban por contenedor (TENANT_ID/STATS_TWO_COLS_MOBILE).
    # Sirve para el colapso a un único contenedor frontend-tenant (ADR en
    # docs/dev/DECISIONS.md).
    op.add_column(
        'tenants',
        sa.Column(
            'settings',
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column('tenants', 'settings')
