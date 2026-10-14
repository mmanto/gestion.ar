"""
Passkeys (WebAuthn): el RP ID tiene que ser el dominio de la página.

Regresión: con un RP ID global (derivado de `FRONTEND_URL`) la SPA —que corre
en el dominio de cada tenant: `pachoteayuda.ar`, `ius.intellify.pro`, …— recibía
las opciones con `admin.intellify.pro` y el navegador bloqueaba la ceremonia con
`SecurityError` ("El navegador bloqueó la passkey. Verificá que el sitio use
HTTPS y el dominio correcto"), así que no se podía crear ni usar ninguna passkey.
"""

from typing import Optional

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.models.tenant import Tenant, TenantStatus
from app.routers import tenant_passkey_router as passkey_router
from app.services.oauth_config import build_passkey_config
from app.services.tenant_service import TenantService


def _tenant(domain: str) -> Tenant:
    return Tenant(
        tenant_id="tenant_pachote",
        name="Pachoteayuda",
        domain=domain,
        status=TenantStatus.ACTIVE,
        plan_id="plan_base",
        created_at="2026-01-01T00:00:00",
        updated_at="2026-01-01T00:00:00",
    )


class _TenantServiceStub:
    """TenantService sin base: mismo criterio que `get_tenant_by_host`."""

    def __init__(self, domains: list[str]) -> None:
        self._domains = domains

    async def get_tenant_by_host(self, host: str) -> Optional[Tenant]:
        host = host.split(":")[0].lower()
        alias = host[: -len(".localhost")] if host.endswith(".localhost") else host
        for domain in self._domains:
            if host == domain or alias == domain:
                return _tenant(domain)
        return None


def _request(headers: dict[str, str], scheme: str = "http") -> Request:
    return Request(
        {
            "type": "http",
            "method": "POST",
            "scheme": scheme,
            "path": "/api/tenant/oauth/passkey/login/options",
            "query_string": b"",
            "server": ("localhost", 8000),
            "headers": [(key.lower().encode(), value.encode()) for key, value in headers.items()],
        }
    )


def test_rp_id_es_el_dominio_de_la_pagina():
    config = build_passkey_config("https://pachoteayuda.ar")

    assert config.rp_id == "pachoteayuda.ar"
    assert config.origins == ["https://pachoteayuda.ar"]


def test_origins_de_entorno_solo_suman_las_del_mismo_host(monkeypatch):
    monkeypatch.setenv(
        "WEBAUTHN_ORIGINS", "http://pachoteayuda.ar.localhost,http://localhost:5174"
    )

    config = build_passkey_config("http://pachoteayuda.ar.localhost:8080")

    assert config.rp_id == "pachoteayuda.ar.localhost"
    # El origin de la página primero; los de entorno solo si son del mismo host.
    assert config.origins == ["http://pachoteayuda.ar.localhost:8080", "http://pachoteayuda.ar.localhost"]


def test_rechaza_un_origin_invalido():
    with pytest.raises(ValueError):
        build_passkey_config("pachoteayuda.ar")


async def test_config_sale_del_origin_de_la_pagina_y_no_del_host_del_api(monkeypatch):
    """Dev: el dev-server proxea /api con `changeOrigin`, así que el Host que ve
    el backend es el upstream (`app:8000`) y el dominio real es el `Origin`."""
    monkeypatch.setattr(
        passkey_router, "get_tenant_service", lambda: _TenantServiceStub(["pachoteayuda.ar"])
    )
    request = _request({"host": "app:8000", "origin": "https://pachoteayuda.ar"})

    config = await passkey_router._passkey_config(request)

    assert config.rp_id == "pachoteayuda.ar"
    assert config.origins == ["https://pachoteayuda.ar"]


async def test_config_acepta_el_alias_de_dev_localhost(monkeypatch):
    monkeypatch.setattr(
        passkey_router, "get_tenant_service", lambda: _TenantServiceStub(["pachoteayuda.ar"])
    )
    request = _request({"host": "pachoteayuda.ar.localhost", "origin": "http://pachoteayuda.ar.localhost"})

    config = await passkey_router._passkey_config(request)

    assert config.rp_id == "pachoteayuda.ar.localhost"


async def test_config_acepta_los_hosts_declarados_por_entorno(monkeypatch):
    """Vite local (`localhost:5174`) con el tenant forzado por `?tenant=<id>`."""
    monkeypatch.setenv("WEBAUTHN_ORIGINS", "http://localhost:5174")
    monkeypatch.setattr(passkey_router, "get_tenant_service", lambda: _TenantServiceStub([]))

    config = await passkey_router._passkey_config(
        _request({"host": "localhost:5174", "origin": "http://localhost:5174"})
    )

    assert config.rp_id == "localhost"
    assert config.origins == ["http://localhost:5174"]


async def test_config_rechaza_un_dominio_que_no_sirve_ninguna_organizacion(monkeypatch):
    monkeypatch.delenv("WEBAUTHN_ORIGINS", raising=False)
    monkeypatch.setattr(passkey_router, "get_tenant_service", lambda: _TenantServiceStub([]))

    with pytest.raises(HTTPException) as exc:
        await passkey_router._passkey_config(_request({"origin": "https://evil.example"}))

    assert exc.value.status_code == 400


def test_page_origin_cae_al_host_cuando_no_hay_origin():
    request = _request({"host": "ius.intellify.pro", "x-forwarded-proto": "https"}, scheme="http")

    assert passkey_router._page_origin(request) == "https://ius.intellify.pro"


async def test_get_tenant_by_host_resuelve_el_alias_localhost(monkeypatch):
    service = TenantService()
    by_domain = {"pachoteayuda.ar": _tenant("pachoteayuda.ar")}

    async def get_tenant_by_domain(domain: str):
        return by_domain.get(domain)

    monkeypatch.setattr(service, "get_tenant_by_domain", get_tenant_by_domain)

    assert (await service.get_tenant_by_host("pachoteayuda.ar.localhost")).tenant_id == "tenant_pachote"
    assert (await service.get_tenant_by_host("PACHOTEAYUDA.ar")).tenant_id == "tenant_pachote"
    assert await service.get_tenant_by_host("otro.ar") is None
