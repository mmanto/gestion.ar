"""add tenants.api_key_hash (API key de tenant para el canal de voz)

La key se emite en claro una sola vez (`tk_live_` + `secrets.token_urlsafe(32)`)
y en la BD queda solo su SHA-256 — mismo patrón que devbout-appointments
(docs/dev/API.md §1.2). La resuelve `TenantService.get_tenant_by_api_key` y
la usa el cliente de voz para obtener el canal del tenant sin JWT de usuario.

Nullable: los tenants existentes no tienen key hasta que el super_admin la
emita. El índice es único (Postgres admite múltiples NULL).

Revision ID: d4a9b1c7e253
Revises: c3f8a2b6d741
Create Date: 2026-10-28 13:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4a9b1c7e253'
down_revision: Union[str, None] = 'c3f8a2b6d741'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tenants', sa.Column('api_key_hash', sa.Text(), nullable=True))
    op.create_index(
        'ix_tenants_api_key_hash', 'tenants', ['api_key_hash'], unique=True
    )


def downgrade() -> None:
    op.drop_index('ix_tenants_api_key_hash', table_name='tenants')
    op.drop_column('tenants', 'api_key_hash')
