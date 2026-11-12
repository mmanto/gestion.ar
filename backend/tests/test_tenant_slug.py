"""
Tests del nombre interno del tenant (`https://intellify.pro/<slug>/`).

Sin base de datos: `app.tenant_slug` es puro y los schemas de alta/edición se
validan en memoria. La parte de resolución contra la BD (colisiones, carrera
del constraint) se cubre en el alta real, no acá.
"""

import pytest
from pydantic import ValidationError

from app.models.tenant import (
    PartnerTenantCreate,
    PartnerTenantUpdate,
    TenantCreate,
    TenantUpdate,
)
from app.tenant_slug import (
    RESERVED_TENANT_SLUGS,
    TenantSlugConflict,
    next_tenant_slug,
    slugify_tenant_name,
    tenant_slug_base,
    validate_tenant_slug,
)


# ── Normalización ────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("IUS Legal", "ius-legal"),
        ("BÖDEN SEED", "boden-seed"),
        ("  Pachote  Ayuda  ", "pachote-ayuda"),
        ("Acme   S.A.", "acme-s-a"),
        ("--Ya--", "ya"),
    ],
)
def test_slugify_tenant_name(name, expected):
    assert slugify_tenant_name(name) == expected


def test_slugify_tenant_name_sin_ascii_usable_devuelve_vacio():
    # Los nombres sin ningún carácter ASCII alfanumérico no dan slug: el caller
    # cae al fallback por tenant_id.
    assert slugify_tenant_name("日本語") == ""
    assert slugify_tenant_name("—") == ""


def test_slugify_tenant_name_trunca_a_50_sin_guion_final():
    # 50 caracteres justos: entra completo.
    assert slugify_tenant_name("a" * 30 + " b") == "a" * 30 + "-b"
    # El truncado no deja el guion separador colgando al final.
    long_slug = slugify_tenant_name("palabra " * 12)
    assert len(long_slug) <= 50
    assert not long_slug.endswith("-")


def test_tenant_slug_base_usa_fallback_del_tenant_id():
    assert tenant_slug_base("IUS Legal", "tenant_abc") == "ius-legal"
    assert tenant_slug_base("日本語", "tenant_abcd1234efgh") == "tenant-1234efgh"


# ── Validación de un slug elegido a mano ─────────────────────────────────────

def test_validate_tenant_slug_normaliza():
    assert validate_tenant_slug("  Acme-2  ") == "acme-2"


@pytest.mark.parametrize(
    "value",
    [
        "a",              # 1 carácter
        "a" * 51,         # 51 caracteres
        "-acme",
        "acme-",
        "acme--legal",
        "acme legal",
        "acmé",
        "",
    ],
)
def test_validate_tenant_slug_rechaza_formas_invalidas(value):
    with pytest.raises(ValueError, match="nombre interno"):
        validate_tenant_slug(value)


def test_validate_tenant_slug_rechaza_reservados():
    for reserved in ("api", "login", "chat", "admin"):
        assert reserved in RESERVED_TENANT_SLUGS
        with pytest.raises(ValueError, match="reservado"):
            validate_tenant_slug(reserved)


# ── Desambiguación ───────────────────────────────────────────────────────────

def test_next_tenant_slug_libre_es_la_base():
    assert next_tenant_slug("acme", set()) == "acme"


def test_next_tenant_slug_desambigua_con_sufijo():
    assert next_tenant_slug("acme", {"acme"}) == "acme-2"
    assert next_tenant_slug("acme", {"acme", "acme-2"}) == "acme-3"


def test_next_tenant_slug_saltea_reservados():
    # Un tenant llamado "API" no puede quedarse con `/api`.
    assert next_tenant_slug("api", set()) == "api-2"


def test_next_tenant_slug_recorta_para_no_pasarse_de_50():
    base = "a" * 50
    slug = next_tenant_slug(base, {base})
    assert slug == "a" * 48 + "-2"
    assert len(slug) == 50


def test_tenant_slug_conflict_es_valueerror_con_mensaje():
    error = TenantSlugConflict()
    assert isinstance(error, ValueError)
    assert str(error) == "Ya existe un tenant con ese nombre interno"


# ── Schemas ──────────────────────────────────────────────────────────────────

def test_tenant_create_normaliza_slug_vacio_a_none():
    # Vacío o sólo espacios = autogenerar del nombre.
    assert TenantCreate(name="Acme", plan_id="p", slug="   ").slug is None
    assert TenantCreate(name="Acme", plan_id="p").slug is None
    assert TenantCreate(name="Acme", plan_id="p", slug="ACME").slug == "acme"


def test_tenant_create_rechaza_slug_invalido_o_reservado():
    with pytest.raises(ValidationError):
        TenantCreate(name="Acme", plan_id="p", slug="api")
    with pytest.raises(ValidationError):
        TenantCreate(name="Acme", plan_id="p", slug="a")


def test_schemas_de_edicion_y_partner_validan_igual():
    assert TenantUpdate(slug="  Acme ").slug == "acme"
    assert PartnerTenantUpdate(slug="").slug is None
    assert PartnerTenantCreate(name="Acme", slug="acme-2").slug == "acme-2"
    with pytest.raises(ValidationError):
        PartnerTenantCreate(name="Acme", slug="login")
