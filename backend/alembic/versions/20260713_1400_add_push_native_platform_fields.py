"""add platform, device_token, user_id to push_subscriptions for native apps

Revision ID: a1b2c3d4e5f6
Revises: 8f1c2a9d4b3e
Create Date: 2026-07-13 14:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '8f1c2a9d4b3e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Relajar columnas VAPID-only para que acepten null
    op.alter_column('push_subscriptions', 'endpoint', nullable=True)
    op.alter_column('push_subscriptions', 'p256dh', nullable=True)
    op.alter_column('push_subscriptions', 'auth', nullable=True)

    # 2. Columna platform con default 'vapid' para registros existentes (todos VAPID hoy)
    op.add_column('push_subscriptions',
                  sa.Column('platform', sa.Text(), nullable=False, server_default='vapid'))

    # 3. Columna device_token para FCM/APNs
    op.add_column('push_subscriptions',
                  sa.Column('device_token', sa.Text(), nullable=True))

    # 4. Columna user_id para staff (FK a users)
    op.add_column('push_subscriptions',
                  sa.Column('user_id', sa.Text(), nullable=True))
    op.create_foreign_key(
        'fk_push_subscriptions_user_id',
        'push_subscriptions', 'users',
        ['user_id'], ['username'],
        ondelete='CASCADE',
    )

    # 5. Índices parciales
    op.create_index(
        'ix_push_subscriptions_user_id',
        'push_subscriptions', ['user_id'],
        unique=False,
        postgresql_where=sa.text('user_id IS NOT NULL'),
    )
    op.create_index(
        'ix_push_subscriptions_device_token',
        'push_subscriptions', ['device_token'],
        unique=True,
        postgresql_where=sa.text('device_token IS NOT NULL'),
    )

    # 6. Índice único parcial en endpoint (ya era UNIQUE, relajamos a parcial)
    op.drop_constraint('push_subscriptions_endpoint_key', 'push_subscriptions', type_='unique')
    op.create_index(
        'ix_push_subscriptions_endpoint_unique',
        'push_subscriptions', ['endpoint'],
        unique=True,
        postgresql_where=sa.text('endpoint IS NOT NULL'),
    )


def downgrade() -> None:
    # Deshacer en orden inverso
    op.drop_index('ix_push_subscriptions_endpoint_unique',
                  table_name='push_subscriptions',
                  postgresql_where=sa.text('endpoint IS NOT NULL'))
    op.execute(
        'ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint)'
    )

    op.drop_index('ix_push_subscriptions_device_token',
                  table_name='push_subscriptions',
                  postgresql_where=sa.text('device_token IS NOT NULL'))
    op.drop_index('ix_push_subscriptions_user_id',
                  table_name='push_subscriptions',
                  postgresql_where=sa.text('user_id IS NOT NULL'))

    op.drop_constraint('fk_push_subscriptions_user_id', 'push_subscriptions', type_='foreignkey')
    op.drop_column('push_subscriptions', 'user_id')
    op.drop_column('push_subscriptions', 'device_token')
    op.drop_column('push_subscriptions', 'platform')
    op.alter_column('push_subscriptions', 'auth', nullable=False)
    op.alter_column('push_subscriptions', 'p256dh', nullable=False)
    op.alter_column('push_subscriptions', 'endpoint', nullable=False)
