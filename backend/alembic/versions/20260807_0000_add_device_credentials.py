"""add device_credentials table for biometric (fingerprint) login

Revision ID: 6d1e4b5c8a9f
Revises: 5e9f3c2ab714
Create Date: 2026-08-07 10:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6d1e4b5c8a9f'
down_revision: Union[str, None] = '5e9f3c2ab714'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'device_credentials',
        sa.Column('device_id', sa.Text(), primary_key=True),
        sa.Column('username', sa.Text(), sa.ForeignKey('users.username', ondelete='CASCADE'), nullable=False),
        sa.Column('secret_hash', sa.Text(), nullable=False),
        sa.Column('device_name', sa.Text(), nullable=True),
        sa.Column('platform', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('revoked', sa.Boolean(), nullable=False, server_default=sa.text('false')),
    )
    op.create_index(
        'ix_device_credentials_username',
        'device_credentials', ['username'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('ix_device_credentials_username', table_name='device_credentials')
    op.drop_table('device_credentials')
