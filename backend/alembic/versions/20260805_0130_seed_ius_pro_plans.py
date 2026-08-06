"""seed ius pro plans (mensual + anual)

Revision ID: 5e9f3c2ab714
Revises: 4c8d2fb0e1a2
Create Date: 2026-08-05 01:30:00.000000+00:00

El tenant ius solo ofrece dos planes de suscripción: "Pro Mensual" (monthly)
y "Pro Anual" (annual). Se seedean en el catálogo si no existen, para que el
autoregistro por gmail asigne el plan elegido (ver ADR-013: la resolución por
periodicidad elige el plan pagado de esa periodicidad).
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '5e9f3c2ab714'
down_revision: Union[str, None] = '4c8d2fb0e1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Montos alineados con PLAN_PRECIOS de app/main.py ($690 MXN/mes, $5,490 MXN/año).
PRO_PLANS = [
    ("plan_pro_mensual", "Pro Mensual", "Suscripción mensual del tenant ius", 690.0, "monthly"),
    ("plan_pro_anual", "Pro Anual", "Suscripción anual del tenant ius", 5490.0, "annual"),
]


def upgrade() -> None:
    for plan_id, name, description, amount, periodicity in PRO_PLANS:
        op.execute(
            f"""
            INSERT INTO plans (plan_id, name, description, amount, periodicity)
            SELECT '{plan_id}', '{name}', '{description}', {amount}, '{periodicity}'
            WHERE NOT EXISTS (SELECT 1 FROM plans WHERE plan_id = '{plan_id}')
            """
        )


def downgrade() -> None:
    for plan_id, *_ in PRO_PLANS:
        op.execute(f"DELETE FROM plans WHERE plan_id = '{plan_id}'")
