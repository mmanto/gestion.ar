"""set home_paths for pachoteayuda (operarios a /reclamos)

Pantalla de inicio por rol, configurada en `tenants.settings.home_paths`. En
pachoteayuda los operarios trabajan sobre la landing de reclamos, así que al
iniciar sesión se los manda ahí (`/reclamos` en el mismo dominio: en dev
`pachoteayuda.ar.localhost/reclamos` y en prod `pachoteayuda.ar/reclamos`); el
resto de los roles sigue cayendo en el panel (`/dashboard`).

Revision ID: f1c7a9e2b4d8
Revises: e6b9c3a71f2d
Create Date: 2026-10-13 15:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f1c7a9e2b4d8'
down_revision: Union[str, None] = 'e6b9c3a71f2d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE tenants
        SET settings = jsonb_set(
            coalesce(settings, '{}'::jsonb),
            '{home_paths}',
            '{"operativo": "/reclamos"}'::jsonb
        )
        WHERE domain = 'pachoteayuda.ar'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE tenants
        SET settings = coalesce(settings, '{}'::jsonb) #- '{home_paths}'
        WHERE domain = 'pachoteayuda.ar'
        """
    )
