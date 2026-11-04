"""add padron module to catalog

Revision ID: f7a2c9e4b1d8
Revises: e7c4b1f0a935
Create Date: 2026-11-04 12:00:00.000000+00:00

El módulo `padron` (consulta del padrón electoral con verificador resuelto por
el usuario) ya existe en `app.modules.manifest`; esta migración sólo lo suma al
catálogo `modules` para que pueda otorgarse/habilitarse por bot.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "f7a2c9e4b1d8"
down_revision: Union[str, None] = "e7c4b1f0a935"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "INSERT INTO modules (module_key, name, description) "
            "VALUES ('padron', 'Padrón electoral', "
            "'Consulta del padrón nacional con verificador resuelto por el usuario') "
            "ON CONFLICT (module_key) DO NOTHING"
        )
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM bot_modules WHERE module_key = 'padron'"))
    op.execute(sa.text("DELETE FROM modules WHERE module_key = 'padron'"))
