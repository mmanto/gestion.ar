"""set free_signup for pachoteayuda

El alta de usuarios de pachoteayuda es gratuita: no vende suscripciones por
usuario como ius (Pro Mensual/Pro Anual). El flag va en `tenants.settings`
(lo lee `Tenant.free_signup`) y lo respetan los tres caminos de alta: el
formulario público `/api/auth/register`, el login/alta con Google del tenant y
el alta con passkey.

Revision ID: e6b9c3a71f2d
Revises: c4f8a1d6e293
Create Date: 2026-10-13 12:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'e6b9c3a71f2d'
down_revision: Union[str, None] = 'c4f8a1d6e293'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE tenants
        SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{free_signup}', 'true'::jsonb)
        WHERE domain = 'pachoteayuda.ar'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE tenants
        SET settings = coalesce(settings, '{}'::jsonb) - 'free_signup'
        WHERE domain = 'pachoteayuda.ar'
        """
    )
