"""add tenant_modules

Entitlement de módulos por tenant (espejo de bot_modules) para tenants sin
agente que igual usan un módulo autónomo (p. ej. appointments). La existencia
de la fila = otorgado; revocar = borrar la fila.

Revision ID: b7d2e4f6a8c1
Revises: f3a1b7c9d2e4
Create Date: 2026-10-09 12:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b7d2e4f6a8c1'
down_revision: Union[str, None] = 'f3a1b7c9d2e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'tenant_modules',
        sa.Column('tenant_id', sa.Text(), nullable=False),
        sa.Column('module_key', sa.Text(), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('granted_by', sa.Text(), nullable=True),
        sa.Column('granted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.tenant_id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['module_key'], ['modules.module_key']),
        sa.ForeignKeyConstraint(['granted_by'], ['users.username']),
        sa.PrimaryKeyConstraint('tenant_id', 'module_key'),
    )
    op.create_index('ix_tenant_modules_module_key', 'tenant_modules', ['module_key'])


def downgrade() -> None:
    op.drop_index('ix_tenant_modules_module_key', table_name='tenant_modules')
    op.drop_table('tenant_modules')
