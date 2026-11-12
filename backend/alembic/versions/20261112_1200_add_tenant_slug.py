"""add tenants.slug (nombre interno de la URL del apex)

Nombre interno del tenant: primer segmento de `https://intellify.pro/<slug>/`.
Se resuelve por path (no por Host), así que un tenant queda accesible sin DNS,
router Traefik ni certificado propios. Ver `app/tenant_slug.py` (fuente de
verdad del formato) y el router `tenant-internal` del apex.

La columna queda nullable a propósito: los scripts históricos de alta
(`backend/scripts/create_*_tenant.py`) insertan tenants sin slug y el backfill
de acá sólo cubre las filas existentes al momento de correr la migración.

Revision ID: c8e1a3f5b270
Revises: b1c4d7e9f2a6
Create Date: 2026-11-12 12:00:00.000000+00:00

"""
import re
import unicodedata
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "c8e1a3f5b270"
down_revision: Union[str, None] = "b1c4d7e9f2a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

#: Copia congelada de `app.tenant_slug` (una migración no importa `app`: el
#: código de la app sigue evolucionando y esta normalización es la de hoy).
MAX_SLUG_LENGTH = 50
RESERVED_TENANT_SLUGS = frozenset({
    "api",
    "ws",
    "assets",
    "icons",
    "tenant-icons",
    "tenant-config.js",
    "sw.js",
    "manifest.webmanifest",
    "favicon.ico",
    "robots.txt",
    "sitemap.xml",
    ".well-known",
    "login",
    "register",
    "registro",
    "chat",
    "u",
    "logout",
    "admin",
})


def _slugify(name: str) -> str:
    """NFKD + ASCII, minúsculas, no-alfanumérico → guion, sin guiones en puntas."""
    decomposed = unicodedata.normalize("NFKD", name or "")
    ascii_only = decomposed.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_only.lower()).strip("-")
    slug = slug[:MAX_SLUG_LENGTH].strip("-")
    return slug if len(slug) >= 2 else ""


def _next_slug(base: str, taken: set) -> str:
    """`base`, `base-2`, `base-3`… salteando reservados y ya tomados."""
    def is_free(candidate: str) -> bool:
        return candidate not in taken and candidate not in RESERVED_TENANT_SLUGS

    if is_free(base):
        return base
    index = 2
    while True:
        suffix = f"-{index}"
        stem = base[: MAX_SLUG_LENGTH - len(suffix)].rstrip("-")
        candidate = f"{stem}{suffix}"
        if is_free(candidate):
            return candidate
        index += 1


def upgrade() -> None:
    op.add_column("tenants", sa.Column("slug", sa.Text(), nullable=True))

    bind = op.get_bind()
    rows = bind.execute(
        sa.text("SELECT tenant_id, name FROM tenants ORDER BY created_at, tenant_id")
    ).fetchall()

    taken: set = set()
    for tenant_id, name in rows:
        base = _slugify(name) or f"tenant-{tenant_id[-8:]}"
        slug = _next_slug(base, taken)
        taken.add(slug)
        bind.execute(
            sa.text("UPDATE tenants SET slug = :slug WHERE tenant_id = :tenant_id"),
            {"slug": slug, "tenant_id": tenant_id},
        )

    op.create_index(
        "ix_tenants_slug",
        "tenants",
        ["slug"],
        unique=True,
        postgresql_where=sa.text("slug IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_tenants_slug", table_name="tenants")
    op.drop_column("tenants", "slug")
