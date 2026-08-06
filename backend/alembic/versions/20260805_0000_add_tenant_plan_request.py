"""add tenants requested_plan_id and subscription_status

Revision ID: 3b7aa1c9d2f0
Revises: ffd47ac84df6
Create Date: 2026-08-05 00:00:00.000000+00:00

Agrega al tenant el plan que el cliente quiere contratar al darse de alta
(autoregistro / gmail) en estado "Pendiente": `requested_plan_id` es el plan
del catálogo solicitado y `subscription_status` su estado de aprobación.

El pase de Pendiente -> Aprobado/Vigente es manual (super_admin) y lo
implementa el endpoint PATCH /api/admin/tenants/{id}/plan-request
(ver ADR-013 en docs/dev/DECISIONS.md).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '3b7aa1c9d2f0'
down_revision: Union[str, None] = 'ffd47ac84df6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # subscribed = el tenant ya tiene plan activo (tenants creados por
    # administración general). El autoregistro lo pasa explícitamente a
    # 'pending' con requested_plan_id.
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


def downgrade() -> None:
    op.drop_constraint('ck_tenants_subscription_status', 'tenants', type_='check')
    op.drop_constraint('fk_tenants_requested_plan_id', 'tenants', type_='foreignkey')
    op.drop_column('tenants', 'subscription_status')
    op.drop_column('tenants', 'requested_plan_id')
