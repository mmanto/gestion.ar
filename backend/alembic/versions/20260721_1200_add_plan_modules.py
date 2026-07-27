"""add plan_modules

Revision ID: 9b57fa27ba3f
Revises: 25bb0e2c98d3
Create Date: 2026-07-21 12:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '9b57fa27ba3f'
down_revision: Union[str, None] = '25bb0e2c98d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Módulos que un plan incluye por defecto (ver ADR-008,
    # docs/dev/DECISIONS.md). BotModule.granted sigue funcionando como
    # override puntual por encima de esto.
    op.create_table(
        'plan_modules',
        sa.Column('plan_id', sa.Text(), nullable=False),
        sa.Column('module_key', sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(['plan_id'], ['plans.plan_id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['module_key'], ['modules.module_key'], ),
        sa.PrimaryKeyConstraint('plan_id', 'module_key'),
    )
    op.create_index('ix_plan_modules_module_key', 'plan_modules', ['module_key'], unique=False)

    # Backfill: intencionalmente vacío. module_service.is_enabled() todavía
    # no consulta plan_modules (eso es el siguiente paso de ADR-008, el
    # Module Registry), así que ningún plan existente pierde ni gana acceso
    # a un módulo por esta migración. Los planes se configuran después vía
    # PlanService.


def downgrade() -> None:
    op.drop_index('ix_plan_modules_module_key', table_name='plan_modules')
    op.drop_table('plan_modules')
