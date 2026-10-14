"""add reclamos table (mapa de reclamos de la landing de pachoteayuda)

Reclamos de vecinos georreferenciados: la página /reclamos/ de la landing de
pachoteayuda deja marcar un punto en el mapa y registrarlo ahí (tipo, texto y
referencia del lugar). Hasta ahora los reclamos de esa página eran los 4 de
ejemplo del mapa de maparg — esta tabla los reemplaza por datos reales.

El reclamo es del tenant (se carga con sesión de un usuario suyo y el listado
público sale del Host de la request), y guarda `created_by` para auditoría:
la API pública no expone quién lo cargó. `estado` arranca en 'pendiente' — el
paso a 'en curso'/'resuelto' no tiene pantalla todavía (lo hace el municipio).

Revision ID: b2e7f4a91c05
Revises: f1c7a9e2b4d8
Create Date: 2026-10-14 12:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2e7f4a91c05'
down_revision: Union[str, None] = 'f1c7a9e2b4d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'reclamos',
        sa.Column('reclamo_id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('tenant_id', sa.Text(), nullable=False),
        sa.Column('tipo', sa.Text(), nullable=False),
        sa.Column('descripcion', sa.Text(), nullable=False),
        sa.Column('lugar', sa.Text(), nullable=True),
        sa.Column('lat', sa.Double(), nullable=False),
        sa.Column('lon', sa.Double(), nullable=False),
        sa.Column('estado', sa.Text(), server_default='pendiente', nullable=False),
        sa.Column('created_by', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("tipo IN ('basura', 'agua')", name='ck_reclamos_tipo'),
        sa.CheckConstraint(
            "estado IN ('pendiente', 'en curso', 'resuelto')", name='ck_reclamos_estado'
        ),
        sa.CheckConstraint(
            "lat BETWEEN -90 AND 90 AND lon BETWEEN -180 AND 180", name='ck_reclamos_coords'
        ),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.tenant_id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.username'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('reclamo_id'),
    )
    op.create_index('ix_reclamos_tenant_id', 'reclamos', ['tenant_id'], unique=False)
    op.create_index(
        'ix_reclamos_tenant_id_created_at', 'reclamos', ['tenant_id', 'created_at'], unique=False
    )


def downgrade() -> None:
    op.drop_index('ix_reclamos_tenant_id_created_at', table_name='reclamos')
    op.drop_index('ix_reclamos_tenant_id', table_name='reclamos')
    op.drop_table('reclamos')
