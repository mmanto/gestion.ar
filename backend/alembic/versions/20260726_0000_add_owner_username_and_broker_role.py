"""add owner_username/channel_id/broker_username and broker role

Cada abogado (operativo) tiene su propio canal/link de chat: los clientes
que entran por ahí quedan asignados a él (channels.owner_username,
copiado a clients.owner_username/clients.channel_id al primer contacto —
ver ClientService.get_or_create_client). Un broker es un abogado con
firma propia: ve lo suyo más lo de los operativos que tienen
users.broker_username = él (ver client_router.py).

Revision ID: 24abc427a41f
Revises: 9b57fa27ba3f
Create Date: 2026-07-26 00:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '24abc427a41f'
down_revision: Union[str, None] = '9b57fa27ba3f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('channels', sa.Column('owner_username', sa.Text(), nullable=True))
    op.create_index('ix_channels_owner_username', 'channels', ['owner_username'])
    op.create_foreign_key(
        'fk_channels_owner_username', 'channels', 'users',
        ['owner_username'], ['username'], ondelete='SET NULL',
    )

    op.add_column('clients', sa.Column('owner_username', sa.Text(), nullable=True))
    op.add_column('clients', sa.Column('channel_id', sa.Text(), nullable=True))
    op.create_index('ix_clients_owner_username', 'clients', ['owner_username'])
    op.create_foreign_key(
        'fk_clients_owner_username', 'clients', 'users',
        ['owner_username'], ['username'], ondelete='SET NULL',
    )
    op.create_foreign_key(
        'fk_clients_channel_id', 'clients', 'channels',
        ['channel_id'], ['channel_id'], ondelete='SET NULL',
    )

    op.add_column('users', sa.Column('broker_username', sa.Text(), nullable=True))
    op.create_index('ix_users_broker_username', 'users', ['broker_username'])
    op.create_foreign_key(
        'fk_users_broker_username', 'users', 'users',
        ['broker_username'], ['username'], ondelete='SET NULL',
    )

    # ck_users_role nunca se llegó a migrar (drift entre models.py y la DB —
    # solo ck_users_role_tenant_consistency existe hoy, ver comentario en
    # models.py). La creamos ahora ya con 'broker' incluido.
    op.create_check_constraint(
        'ck_users_role',
        'users',
        "role IN ('super_admin', 'admin', 'operativo', 'broker')",
    )
    op.drop_constraint('ck_users_role_tenant_consistency', 'users', type_='check')
    op.create_check_constraint(
        'ck_users_role_tenant_consistency',
        'users',
        "(role = 'super_admin' AND tenant_id IS NULL) OR "
        "(role IN ('admin', 'operativo', 'broker') AND tenant_id IS NOT NULL)",
    )
    # Un broker no reporta a otro broker/admin, y admin/super_admin tampoco
    # tienen broker (esa jerarquía solo aplica a operativo).
    op.create_check_constraint(
        'ck_users_broker_username_only_operativo',
        'users',
        "broker_username IS NULL OR role = 'operativo'",
    )


def downgrade() -> None:
    op.drop_constraint('ck_users_broker_username_only_operativo', 'users', type_='check')
    op.drop_constraint('ck_users_role_tenant_consistency', 'users', type_='check')
    op.create_check_constraint(
        'ck_users_role_tenant_consistency',
        'users',
        "(role = 'super_admin' AND tenant_id IS NULL) OR "
        "(role IN ('admin', 'operativo') AND tenant_id IS NOT NULL)",
    )
    op.drop_constraint('ck_users_role', 'users', type_='check')

    op.drop_constraint('fk_users_broker_username', 'users', type_='foreignkey')
    op.drop_index('ix_users_broker_username', table_name='users')
    op.drop_column('users', 'broker_username')

    op.drop_constraint('fk_clients_channel_id', 'clients', type_='foreignkey')
    op.drop_constraint('fk_clients_owner_username', 'clients', type_='foreignkey')
    op.drop_index('ix_clients_owner_username', table_name='clients')
    op.drop_column('clients', 'channel_id')
    op.drop_column('clients', 'owner_username')

    op.drop_constraint('fk_channels_owner_username', 'channels', type_='foreignkey')
    op.drop_index('ix_channels_owner_username', table_name='channels')
    op.drop_column('channels', 'owner_username')
