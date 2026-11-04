"""
Tests del módulo `padron` (extensión de chat del padrón electoral).

Lo que se prueba es el estado por conexión: la tool deja un verificador
pendiente y el interceptor del turno siguiente lo resuelve. Los casos que
importan son los que el sitio provoca en la vida real: código equivocado (401),
verificador vencido a los 300 s, texto que no es un código, y el sitio caído
(degradar al enlace, nunca una excepción dentro del loop del LLM).
"""

import pytest

from app.modules import padron_ext as mod
from app.services.padron_service import Captcha


class _Bot:
    config = None


def _captcha(i):
    return Captcha(token=f"tok{i}", ttl=300, image_b64="AAA")


def _pending(token="tok1", fetched_at=None):
    return {
        "token": token,
        "ttl": 300,
        "fetched_at": mod.time.monotonic() if fetched_at is None else fetched_at,
        "args": {"dni": 12345678, "sexo": "m", "distrito": 2},
    }


def test_tool_guarda_pendiente_y_widget(monkeypatch):
    monkeypatch.setattr(mod.padron_service, "fetch_captcha", lambda client: _captcha(1))
    ns = {}
    tools, executors = mod.provide_tools(_Bot(), None, None, "web", ns)
    assert tools == [mod.PADRON_TOOL_SPEC]
    resultado = executors[mod.PADRON_TOOL_NAME](mod.PADRON_TOOL_NAME, {"dni": 12345678, "sexo": "m"})
    assert resultado["status"] == "captcha_pendiente"
    assert ns["pending"]["token"] == "tok1"
    assert ns["pending"]["args"] == {"dni": 12345678, "sexo": "m", "distrito": 2}
    assert ns["result"]["widget"]["widget_type"] == "padron_captcha"


def test_segunda_consulta_reemplaza_el_pendiente(monkeypatch):
    tokens = iter([_captcha(1), _captcha(2)])
    monkeypatch.setattr(mod.padron_service, "fetch_captcha", lambda client: next(tokens))
    ns = {}
    _, executors = mod.provide_tools(_Bot(), None, None, "web", ns)
    executors[mod.PADRON_TOOL_NAME](mod.PADRON_TOOL_NAME, {"dni": 12345678, "sexo": "m"})
    executors[mod.PADRON_TOOL_NAME](mod.PADRON_TOOL_NAME, {"dni": 12345678, "sexo": "f"})
    assert ns["pending"]["token"] == "tok2"
    assert ns["pending"]["args"]["sexo"] == "f"


def test_tool_rechaza_dni_invalido_sin_tocar_la_red(monkeypatch):
    llamado = []
    monkeypatch.setattr(mod.padron_service, "fetch_captcha", lambda client: llamado.append(1))
    ns = {}
    _, executors = mod.provide_tools(_Bot(), None, None, "web", ns)
    resultado = executors[mod.PADRON_TOOL_NAME](mod.PADRON_TOOL_NAME, {"dni": "abc", "sexo": "m"})
    assert "dni" in resultado["error"].lower()
    assert llamado == []
    assert "pending" not in ns


def test_tool_degrada_a_derivacion_si_el_sitio_falla(monkeypatch):
    def _boom(client):
        raise mod.padron_service.PadronError("caido")

    monkeypatch.setattr(mod.padron_service, "fetch_captcha", _boom)
    ns = {}
    _, executors = mod.provide_tools(_Bot(), None, None, "web", ns)
    executors[mod.PADRON_TOOL_NAME](mod.PADRON_TOOL_NAME, {"dni": 12345678, "sexo": "m"})
    assert "padron.gob.ar" in ns["result"]["message"]
    assert ns["result"]["widget"] is None


@pytest.mark.asyncio
async def test_intercept_sin_pendiente_no_interviene():
    assert await mod.intercept(_Bot(), None, "hola", {}) is None


@pytest.mark.asyncio
async def test_intercept_repregunta_si_el_texto_no_es_codigo(monkeypatch):
    llamado = []
    monkeypatch.setattr(mod.padron_service, "consultar", lambda *a, **k: llamado.append(1))
    ns = {"pending": {"token": "t", "ttl": 300, "fetched_at": mod.time.monotonic(), "args": {}}}
    resultado = await mod.intercept(_Bot(), None, "hola, qué tal", ns)
    assert resultado["message"]
    assert "pending" in ns
    assert llamado == []


@pytest.mark.asyncio
async def test_intercept_401_pide_captcha_nuevo_y_reemplaza_token(monkeypatch):
    monkeypatch.setattr(mod.padron_service, "consultar", lambda *a, **k: {"status": 401, "data": None})
    monkeypatch.setattr(mod.padron_service, "fetch_captcha", lambda client: _captcha(2))
    ns = {"pending": _pending()}
    resultado = await mod.intercept(_Bot(), None, "ABCD", ns)
    assert resultado["widget"]["widget_type"] == "padron_captcha"
    assert ns["pending"]["token"] == "tok2"


@pytest.mark.asyncio
async def test_intercept_200_devuelve_resultado_y_limpia_estado(monkeypatch):
    monkeypatch.setattr(
        mod.padron_service,
        "consultar",
        lambda *a, **k: {"status": 200, "data": {"establecimiento": "ESCUELA 1", "mesa": 42, "orden": 7}},
    )
    ns = {"pending": _pending()}
    resultado = await mod.intercept(_Bot(), None, "ABCD", ns)
    assert "ESCUELA 1" in resultado["message"]
    assert "pending" not in ns


@pytest.mark.asyncio
async def test_intercept_vencido_pide_captcha_nuevo(monkeypatch):
    monkeypatch.setattr(mod.padron_service, "fetch_captcha", lambda client: _captcha(3))
    llamado = []
    monkeypatch.setattr(mod.padron_service, "consultar", lambda *a, **k: llamado.append(1))
    ns = {"pending": _pending(fetched_at=mod.time.monotonic() - 301)}
    resultado = await mod.intercept(_Bot(), None, "ABCD", ns)
    assert resultado["widget"]["widget_type"] == "padron_captcha"
    assert ns["pending"]["token"] == "tok3"
    assert llamado == []


@pytest.mark.asyncio
async def test_intercept_404_avisa_que_no_figura(monkeypatch):
    monkeypatch.setattr(mod.padron_service, "consultar", lambda *a, **k: {"status": 404, "data": None})
    ns = {"pending": _pending()}
    resultado = await mod.intercept(_Bot(), None, "ABCD", ns)
    assert "padrón" in resultado["message"]
    assert "pending" not in ns
