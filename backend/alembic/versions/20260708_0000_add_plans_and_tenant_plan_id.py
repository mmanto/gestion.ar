"""add plans table and tenants.plan_id

Revision ID: c4d8e1f6a209
Revises: a1f3c9d02b4e
Create Date: 2026-07-08 00:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c4d8e1f6a209'
down_revision: Union[str, None] = 'a1f3c9d02b4e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_PLAN_ID = 'plan_000000000000'


def upgrade() -> None:
    op.create_table(
        'plans',
        sa.Column('plan_id', sa.Text(), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('amount', sa.Numeric(), nullable=False),
        sa.Column('periodicity', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("periodicity IN ('monthly', 'annual')", name='ck_plans_periodicity'),
        sa.PrimaryKeyConstraint('plan_id'),
    )

    # Plan por defecto — todo tenant existente queda suscripto acá hasta que
    # administración general le asigne un plan real.
    op.execute(
        f"""
        INSERT INTO plans (plan_id, name, description, amount, periodicity)
        VALUES ('{DEFAULT_PLAN_ID}', 'Plan Básico', 'Plan por defecto asignado a tenants existentes', 0, 'monthly')
        """
    )

    op.add_column('tenants', sa.Column('plan_id', sa.Text(), nullable=True))
    op.execute(f"UPDATE tenants SET plan_id = '{DEFAULT_PLAN_ID}' WHERE plan_id IS NULL")
    op.alter_column('tenants', 'plan_id', nullable=False)
    op.create_index('ix_tenants_plan_id', 'tenants', ['plan_id'], unique=False)
    op.create_foreign_key('fk_tenants_plan_id', 'tenants', 'plans', ['plan_id'], ['plan_id'])


def downgrade() -> None:
    op.drop_constraint('fk_tenants_plan_id', 'tenants', type_='foreignkey')
    op.drop_index('ix_tenants_plan_id', table_name='tenants')
    op.drop_column('tenants', 'plan_id')
    op.drop_table('plans')
