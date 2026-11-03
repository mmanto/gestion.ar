"""add tenant_llm_configs (proveedor + API key de IA por tenant)

Una fila por tenant con el proveedor elegido (claude | deepseek | openrouter),
su modelo y la API key cifrada (Fernet derivada de ENCRYPTION_KEY, ver
`app/services/secrets_service.py` y ADR-038). Sin fila, el agente del tenant no
responde: no hay fallback a las keys globales de `.env`.

No hay backfill: cada tenant carga su configuración desde el backoffice
(Ajustes › Proveedor de IA) después del deploy.

Revision ID: e7c4b1f0a935
Revises: d4a9b1c7e253
Create Date: 2026-11-03 12:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e7c4b1f0a935'
down_revision: Union[str, None] = 'd4a9b1c7e253'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'tenant_llm_configs',
        sa.Column('tenant_id', sa.Text(), nullable=False),
        sa.Column('provider', sa.Text(), nullable=False),
        sa.Column('model', sa.Text(), nullable=False),
        sa.Column('api_key_encrypted', sa.Text(), nullable=False),
        sa.Column('api_key_hint', sa.Text(), nullable=False),
        sa.Column('last_validated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.Column('updated_by', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.tenant_id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['updated_by'], ['users.username'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('tenant_id'),
        sa.CheckConstraint(
            "provider IN ('claude', 'deepseek', 'openrouter')",
            name='ck_tenant_llm_configs_provider',
        ),
    )


def downgrade() -> None:
    op.drop_table('tenant_llm_configs')
