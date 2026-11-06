"""
Tests del módulo `padron` (extensión de chat del padrón electoral).

Lo que se prueba es el estado por conexión: la tool deja un verificador
pendiente y el interceptor del turno siguiente lo resuelve. Los casos que
importan son los que el sitio provoca en la vida real: código equivocado (401),
verificador vencido a los 300 s, texto que no es un código, y el sitio caído
(degradar al enlace, nunca una excepción dentro del loop del LLM).
"""

import pytest

import threading

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
    assert [t["name"] for t in tools] == [mod.SOLICITAR_TOOL_NAME, mod.PADRON_TOOL_NAME]
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
async def test_intercept_texto_que_no_es_codigo_cede_al_llm(monkeypatch):
    """Con el verificador pendiente, una frase suelta sigue al LLM en vez de
    recibir otra vez "escribí el código"; el token no se consume."""
    llamado = []
    monkeypatch.setattr(mod.padron_service, "consultar", lambda *a, **k: llamado.append(1))
    ns = {"pending": {"token": "t", "ttl": 300, "fetched_at": mod.time.monotonic(), "args": {}}}
    resultado = await mod.intercept(_Bot(), None, "hola, qué tal", ns)
    assert resultado is None
    assert "pending" in ns
    assert llamado == []


@pytest.mark.asyncio
async def test_intercept_saludo_no_consume_el_token(monkeypatch):
    """Un «hola» matchea el regex del código pero es un saludo: no va al POST."""
    llamado = []
    monkeypatch.setattr(mod.padron_service, "consultar", lambda *a, **k: llamado.append(1))
    ns = {"pending": _pending()}
    resultado = await mod.intercept(_Bot(), None, "hola", ns)
    assert resultado is None
    assert "pending" in ns
    assert llamado == []


@pytest.mark.asyncio
async def test_intercept_usa_un_hilo_aparte_para_la_red(monkeypatch):
    visto = {}

    def _consultar(*a, **k):
        visto["thread"] = threading.current_thread()
        return {"status": 200, "data": {"mesa": 1}}

    monkeypatch.setattr(mod.padron_service, "consultar", _consultar)
    ns = {"pending": _pending()}
    await mod.intercept(_Bot(), None, "ABCD", ns)
    assert visto["thread"] is not threading.main_thread()


@pytest.mark.asyncio
async def test_intercept_error_de_red_deriva_al_enlace(monkeypatch):
    monkeypatch.setattr(mod.padron_service, "consultar", lambda *a, **k: {"status": "error", "data": None})
    ns = {"pending": _pending()}
    resultado = await mod.intercept(_Bot(), None, "ABCD", ns)
    assert "padron.gob.ar" in resultado["message"]
    assert "pending" not in ns


def test_tool_rechaza_dni_de_tres_digitos(monkeypatch):
    llamado = []
    monkeypatch.setattr(mod.padron_service, "fetch_captcha", lambda client: llamado.append(1))
    ns = {}
    _, executors = mod.provide_tools(_Bot(), None, None, "web", ns)
    resultado = executors[mod.PADRON_TOOL_NAME](mod.PADRON_TOOL_NAME, {"dni": 123, "sexo": "m"})
    assert "dni" in resultado["error"].lower()
    assert llamado == []


def test_tool_rechaza_distrito_fuera_de_rango(monkeypatch):
    llamado = []
    monkeypatch.setattr(mod.padron_service, "fetch_captcha", lambda client: llamado.append(1))
    ns = {}
    _, executors = mod.provide_tools(_Bot(), None, None, "web", ns)
    resultado = executors[mod.PADRON_TOOL_NAME](mod.PADRON_TOOL_NAME, {"dni": 12345678, "sexo": "m", "distrito": 99})
    assert "distrito" in resultado["error"].lower()
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


# --- Tool de inicio: entiende el pedido y solicita los datos que faltan ---


def test_solicitar_sin_datos_pregunta_dni_y_sexo(monkeypatch):
    llamado = []
    monkeypatch.setattr(mod.padron_service, "fetch_captcha", lambda client: llamado.append(1))
    ns = {}
    tools, executors = mod.provide_tools(_Bot(), None, None, "web", ns)
    assert mod.SOLICITAR_TOOL_NAME in [t["name"] for t in tools]
    resultado = executors[mod.SOLICITAR_TOOL_NAME](mod.SOLICITAR_TOOL_NAME, {})
    assert resultado["status"] == "datos_pendientes"
    assert "dni" in resultado["message"].lower()
    assert "sexo" in resultado["message"].lower()
    assert ns["collect"] == {}
    assert ns["result"]["widget"] is None
    assert llamado == []


def test_solicitar_con_dni_pide_solo_sexo(monkeypatch):
    monkeypatch.setattr(mod.padron_service, "fetch_captcha", lambda client: _captcha(1))
    ns = {}
    _, executors = mod.provide_tools(_Bot(), None, None, "web", ns)
    resultado = executors[mod.SOLICITAR_TOOL_NAME](mod.SOLICITAR_TOOL_NAME, {"dni": 12345678})
    assert "sexo" in resultado["message"].lower()
    assert "dni" not in resultado["message"].lower()
    assert ns["collect"] == {"dni": 12345678}


def test_solicitar_completo_baja_el_captcha(monkeypatch):
    monkeypatch.setattr(mod.padron_service, "fetch_captcha", lambda client: _captcha(1))
    ns = {}
    _, executors = mod.provide_tools(_Bot(), None, None, "web", ns)
    resultado = executors[mod.SOLICITAR_TOOL_NAME](mod.SOLICITAR_TOOL_NAME, {"dni": 12345678, "sexo": "f"})
    assert resultado["status"] == "captcha_pendiente"
    assert ns["pending"]["args"] == {"dni": 12345678, "sexo": "f", "distrito": 2}
    assert "collect" not in ns
    assert ns["result"]["widget"]["widget_type"] == "padron_captcha"


@pytest.mark.asyncio
async def test_intercept_completa_los_datos_desde_texto_libre(monkeypatch):
    monkeypatch.setattr(mod.padron_service, "fetch_captcha", lambda client: _captcha(5))
    ns = {"collect": {}}
    resultado = await mod.intercept(_Bot(), None, "mi dni es 12.345.678 y soy mujer", ns)
    assert resultado["widget"]["widget_type"] == "padron_captcha"
    assert ns["pending"]["args"] == {"dni": 12345678, "sexo": "f", "distrito": 2}
    assert "collect" not in ns


@pytest.mark.asyncio
async def test_intercept_con_dni_solo_repite_el_pedido_de_sexo(monkeypatch):
    llamado = []
    monkeypatch.setattr(mod.padron_service, "fetch_captcha", lambda client: llamado.append(1))
    ns = {"collect": {}}
    resultado = await mod.intercept(_Bot(), None, "12345678", ns)
    assert "sexo" in resultado["message"].lower()
    assert ns["collect"]["dni"] == 12345678
    assert llamado == []


@pytest.mark.asyncio
async def test_intercept_entiende_sexo_suelto(monkeypatch):
    monkeypatch.setattr(mod.padron_service, "fetch_captcha", lambda client: _captcha(6))
    ns = {"collect": {"dni": 12345678}}
    resultado = await mod.intercept(_Bot(), None, "varón", ns)
    assert resultado["widget"]["widget_type"] == "padron_captcha"
    assert ns["pending"]["args"]["sexo"] == "m"


@pytest.mark.asyncio
async def test_intercept_cancelar_limpia_el_pedido(monkeypatch):
    ns = {"collect": {"dni": 12345678}}
    resultado = await mod.intercept(_Bot(), None, "cancelar", ns)
    assert "cancel" in resultado["message"].lower()
    assert "collect" not in ns


@pytest.mark.asyncio
async def test_intercept_sin_datos_utiles_cede_al_llm(monkeypatch):
    """Un «no sé» no aporta ningún dato: no se queda repitiendo la pregunta."""
    ns = {"collect": {}}
    resultado = await mod.intercept(_Bot(), None, "no sé", ns)
    assert resultado is None
    assert "collect" not in ns


@pytest.mark.asyncio
async def test_intercept_otra_consulta_no_queda_atrapada(monkeypatch):
    """Con la recolección abierta, una pregunta distinta sigue al LLM en vez de
    recibir otra vez el pedido de DNI/sexo."""
    ns = {"collect": {"dni": 12345678}}
    resultado = await mod.intercept(
        _Bot(), None, "¿qué trámites puedo hacer en el municipio?", ns
    )
    assert resultado is None
    assert "collect" not in ns
