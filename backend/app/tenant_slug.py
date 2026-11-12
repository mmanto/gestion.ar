"""
Nombre interno del tenant — segmento de la URL interna `https://intellify.pro/<slug>/`.

El dominio externo (`tenants.domain`) sigue resolviendo por Host y exige un
router Traefik + certificado por tenant. El slug, en cambio, se resuelve por el
primer segmento del path del apex, así que un tenant recién creado es accesible
sin tocar DNS ni Traefik.

Módulo puro (sin ORM ni red) para poder testearlo y para que la migración de
backfill use la misma normalización.
"""

import re
import unicodedata

#: Primer segmento del path del apex que NUNCA puede ser un tenant: son rutas y
#: assets que ya sirve el propio frontend-tenant o el backend en ese host
#: (`/api/…`, `/ws/…`, `/icons/…`, `/login`, `/chat/…`, el panel…). Un tenant con
#: uno de esos nombres quedaría inalcanzable o taparía una ruta de la app.
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

#: 2–50 caracteres, minúsculas/números/guiones, sin guion al principio ni al
#: final. Es el mismo patrón que replica el frontend (`config/internalTenant.ts`)
#: e `index.html` para decidir si el primer segmento es un tenant.
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$")

MAX_SLUG_LENGTH = 50
MIN_SLUG_LENGTH = 2


class TenantSlugConflict(ValueError):
    """Ya hay un tenant con ese nombre interno (constraint `ix_tenants_slug`)."""

    def __init__(self, message: str = "Ya existe un tenant con ese nombre interno") -> None:
        super().__init__(message)


def slugify_tenant_name(name: str) -> str:
    """Nombre del tenant → base del nombre interno.

    NFKD + descarte de no-ASCII (``BÖDEN SEED`` → ``BODEN SEED``), minúsculas,
    runs de cualquier cosa no alfanumérica → un guion, sin guiones en los
    extremos y truncado a 50. Devuelve `""` si no queda nada usable: el caller
    cae al fallback `tenant-<últimos 8 del tenant_id>` (ver `tenant_slug_base`).
    """
    decomposed = unicodedata.normalize("NFKD", name or "")
    ascii_only = decomposed.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_only.lower()).strip("-")
    slug = slug[:MAX_SLUG_LENGTH].strip("-")
    return slug if len(slug) >= MIN_SLUG_LENGTH else ""


def tenant_slug_base(name: str, tenant_id: str) -> str:
    """Base del slug de un tenant nuevo: el nombre, o `tenant-<8 últimos del id>`."""
    return slugify_tenant_name(name) or f"tenant-{tenant_id[-8:]}"


def validate_tenant_slug(value: str) -> str:
    """Normaliza y valida un nombre interno elegido a mano.

    Raises:
        ValueError: no matchea `SLUG_RE`, tiene `--` o está reservado.
    """
    slug = (value or "").strip().lower()
    if not SLUG_RE.match(slug) or "--" in slug:
        raise ValueError(
            "El nombre interno sólo admite minúsculas, números y guiones (2-50 caracteres)."
        )
    if slug in RESERVED_TENANT_SLUGS:
        raise ValueError("Ese nombre interno está reservado.")
    return slug


def next_tenant_slug(base: str, taken: set[str]) -> str:
    """Primer slug libre a partir de `base`: `base`, `base-2`, `base-3`…

    Saltea los reservados y los de `taken`. Al sufijar recorta la base para no
    pasarse de 50 caracteres (`base` es la forma normalizada del nombre).
    """
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
