"""move plan request from tenants to users

Revision ID: 4c8d2fb0e1a2
Revises: 3b7aa1c9d2f0
Create Date: 2026-08-05 01:00:00.000000+00:00

Corrige ADR-013: la suscripción es del **usuario**, no del tenant. Cada
usuario elige y paga su propio plan. Se quitan las columnas recién agregadas
al tenant (requested_plan_id / subscription_status) y se agregan al usuario.

Ver ADR-013 (actualizado) en docs/dev/DECISIONS.md.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '4c8d2fb0e1a2'
down_revision: Union[str, None] = '3b7aa1c9d2f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1) Quitar columnas del tenant (introducidas por error en 3b7aa1c9d2f0).
    op.drop_constraint('fk_tenants_requested_plan_id', 'tenants', type_='foreignkey')
    op.drop_constraint('ck_tenants_subscription_status', 'tenants', type_='check')
    op.drop_column('tenants', 'requested_plan_id')
    op.drop_column('tenants', 'subscription_status')

    # 2) Agregar columnas al usuario (la suscripción es por usuario).
    op.add_column(
        'users',
        sa.Column('requested_plan_id', sa.Text(), nullable=True),
    )
    op.add_column(
        'users',
        sa.Column(
            'subscription_status',
            sa.Text(),
            nullable=False,
            server_default='active',
        ),
    )
    op.create_foreign_key(
        'fk_users_requested_plan_id',
        'users', 'plans',
        ['requested_plan_id'], ['plan_id'],
    )
    op.create_check_constraint(
        'ck_users_subscription_status',
        'users',
        "subscription_status IN ('pending', 'approved', 'active')",
    )


def downgrade() -> None:
    # Revertir: quitar columnas del usuario y devolverlas al tenant.
    op.drop_constraint('ck_users_subscription_status', 'users', type_='check')
    op.drop_constraint('fk_users_requested_plan_id', 'users', type_='foreignkey')
    op.drop_column('users', 'subscription_status')
    op.drop_column('users', 'requested_plan_id')

    op.add_column(
        'tenants',
        sa.Column('requested_plan_id', sa.Text(), nullable=True),
    )
    op.add_column(
        'tenants',
        sa.Column(
            'subscription_status',
            sa.Text(),
            nullable=False,
            server_default='active',
        ),
    )
    op.create_foreign_key(
        'fk_tenants_requested_plan_id',
        'tenants', 'plans',
        ['requested_plan_id'], ['plan_id'],
    )
    op.create_check_constraint(
        'ck_tenants_subscription_status',
        'tenants',
        "subscription_status IN ('pending', 'approved', 'active')",
    )
