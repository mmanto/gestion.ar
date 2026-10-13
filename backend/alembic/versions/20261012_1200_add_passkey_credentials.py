"""add passkey_credentials table for WebAuthn (passkey) login

Login con Face ID / huella / Windows Hello / llave de seguridad vía
devbout-oauth (`PasskeyStorage`). Se guarda la clave pública del autenticador
y su contador de firmas — nunca un secreto. Revocar una passkey borra la fila.

Revision ID: c4f8a1d6e293
Revises: b7d2e4f6a8c1
Create Date: 2026-10-12 12:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'c4f8a1d6e293'
down_revision: Union[str, None] = 'b7d2e4f6a8c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'passkey_credentials',
        sa.Column('credential_id', sa.Text(), primary_key=True),
        sa.Column('username', sa.Text(), sa.ForeignKey('users.username', ondelete='CASCADE'), nullable=False),
        sa.Column('public_key', sa.Text(), nullable=False),
        sa.Column('sign_count', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('transports', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column('name', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        'ix_passkey_credentials_username',
        'passkey_credentials', ['username'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index('ix_passkey_credentials_username', table_name='passkey_credentials')
    op.drop_table('passkey_credentials')
