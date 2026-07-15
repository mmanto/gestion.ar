"""drop estado column from clients (now derived from color_semaforo)

Revision ID: d2f8b6c4a917
Revises: c9a72e5f1b3d
Create Date: 2026-07-15T14:38:40.373276+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd2f8b6c4a917'
down_revision: Union[str, None] = 'c9a72e5f1b3d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # estado deja de ser un dato independiente: se deriva siempre de
    # color_semaforo (verde=Viable/amarillo=Potencial/rojo=Exploración/
    # null=Sin clasificar), ver app/models/client.py::estado_from_color.
    op.drop_column('clients', 'estado')


def downgrade() -> None:
    op.add_column('clients', sa.Column('estado', sa.Text(), nullable=False, server_default='nuevo'))
