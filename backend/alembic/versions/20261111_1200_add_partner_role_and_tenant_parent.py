"""add partner role and tenants.parent_tenant_id

El rol `partner` (ADR-041) es un usuario de administración delegada: un
`users.tenant_id` apunta a su tenant base y desde ahí construye tenants
derivados. `tenants.parent_tenant_id` es el vínculo base → derivado (un solo
nivel); el clon del alta es una foto, no un vínculo de propagación.

Revision ID: b1c4d7e9f2a6
Revises: f7a2c9e4b1d8
Create Date: 2026-11-11 12:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "b1c4d7e9f2a6"
down_revision: Union[str, None] = "f7a2c9e4b1d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("parent_tenant_id", sa.Text(), nullable=True))
    op.create_index("ix_tenants_parent_tenant_id", "tenants", ["parent_tenant_id"])
    op.create_foreign_key(
        "fk_tenants_parent_tenant_id", "tenants", "tenants",
        ["parent_tenant_id"], ["tenant_id"],
    )
    # Un tenant no puede ser su propio padre (evita ciclos triviales).
    op.create_check_constraint(
        "ck_tenants_parent_not_self", "tenants",
        "parent_tenant_id IS NULL OR parent_tenant_id <> tenant_id",
    )

    op.drop_constraint("ck_users_role", "users", type_="check")
    op.create_check_constraint(
        "ck_users_role",
        "users",
        "role IN ('super_admin', 'admin', 'operativo', 'broker', 'partner')",
    )
    op.drop_constraint("ck_users_role_tenant_consistency", "users", type_="check")
    # El partner siempre tiene tenant (su tenant base); sólo super_admin vive
    # sin tenant.
    op.create_check_constraint(
        "ck_users_role_tenant_consistency",
        "users",
        "(role = 'super_admin' AND tenant_id IS NULL) OR "
        "(role IN ('admin', 'operativo', 'broker', 'partner') AND tenant_id IS NOT NULL)",
    )


def downgrade() -> None:
    # Los tenants derivados pierden el vínculo antes de que el rol `partner`
    # desaparezca: sin rol partner no hay quién los administre.
    op.execute(sa.text("UPDATE tenants SET parent_tenant_id = NULL WHERE parent_tenant_id IS NOT NULL"))
    op.execute(sa.text("UPDATE users SET role = 'admin' WHERE role = 'partner'"))

    op.drop_constraint("ck_users_role_tenant_consistency", "users", type_="check")
    op.create_check_constraint(
        "ck_users_role_tenant_consistency",
        "users",
        "(role = 'super_admin' AND tenant_id IS NULL) OR "
        "(role IN ('admin', 'operativo', 'broker') AND tenant_id IS NOT NULL)",
    )
    op.drop_constraint("ck_users_role", "users", type_="check")
    op.create_check_constraint(
        "ck_users_role",
        "users",
        "role IN ('super_admin', 'admin', 'operativo', 'broker')",
    )

    op.drop_constraint("ck_tenants_parent_not_self", "tenants", type_="check")
    op.drop_constraint("fk_tenants_parent_tenant_id", "tenants", type_="foreignkey")
    op.drop_index("ix_tenants_parent_tenant_id", table_name="tenants")
    op.drop_column("tenants", "parent_tenant_id")
