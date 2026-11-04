"""
Tests del servicio de consulta del padrón electoral (padron.gob.ar).

Contrato verificado contra el sitio el 2026-11-04: el captcha se pide con
`POST /padron-api/captcha.jpg` (devuelve `token|ttl|base64JPEG`, hoy 300 s de
vida) y la consulta es un `POST /padron-api/consulta` form-urlencoded que lleva
el token en la cookie `token`. Sin red: se prueba el parseo, el mapeo de status
y el formateo, que son las partes donde un cambio del sitio rompe el chat.
"""

import pytest

from app.services import padron_service as mod
from app.services.padron_service import (
    Captcha,
    PadronError,
    captcha_widget,
    consultar,
    formatear_resultado,
    parse_captcha,
)


class _Resp:
    def __init__(self, status_code, body, payload=None):
        self.status_code = status_code
        self.text = body
        self._payload = payload or {}

    def json(self):
        return self._payload


class _Client:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return self.response


def test_parse_captcha_extrae_token_ttl_e_imagen():
    captcha = parse_captcha("abc123|300|/9j/4AAQSkZJRg==")
    assert captcha == Captcha(token="abc123", ttl=300, image_b64="/9j/4AAQSkZJRg==")


def test_parse_captcha_rechaza_respuesta_inesperada():
    with pytest.raises(PadronError):
        parse_captcha("no-es-el-formato")


def test_captcha_widget_arma_data_url_jpeg():
    widget = captcha_widget(Captcha(token="t", ttl=300, image_b64="AAA"))
    assert widget == {
        "widget_type": "padron_captcha",
        "image": "data:image/jpeg;base64,AAA",
    }


def test_consultar_manda_token_como_cookie_y_form():
    client = _Client(_Resp(401, ""))
    resultado = consultar(client, token="tok", codigo="ZZZZ", dni=12345678, distrito=2, sexo="m")
    assert resultado == {"status": 401, "data": None}
    url, kwargs = client.calls[0]
    assert url == mod.CONSULTA_URL
    assert kwargs["cookies"] == {"token": "tok"}
    assert kwargs["data"] == {"c": "ZZZZ", "e": "", "m": 12345678, "d": 2, "s": "m"}


def test_consultar_devuelve_data_en_200():
    client = _Client(_Resp(200, "", {"mesa": 12}))
    assert consultar(client, token="t", codigo="AAAA", dni=1, distrito=2, sexo="f") == {
        "status": 200,
        "data": {"mesa": 12},
    }


def test_consultar_mapea_error_de_red():
    client = _Client(_Resp(500, "boom"))
    assert consultar(client, token="t", codigo="AAAA", dni=1, distrito=2, sexo="x") == {
        "status": "error",
        "data": None,
    }


def test_consultar_rechaza_200_que_no_es_objeto():
    client = _Client(_Resp(200, "", ["no", "es", "un", "objeto"]))
    assert consultar(client, token="t", codigo="AAAA", dni=1, distrito=2, sexo="m") == {
        "status": "error",
        "data": None,
    }


def test_formatear_resultado_arma_texto_legible():
    texto = formatear_resultado(
        {
            "nombre": "JUAN PEREZ",
            "establecimiento": "ESCUELA 1",
            "direccion": "SAN MARTIN 100",
            "mesa": 42,
            "orden": 7,
        }
    )
    assert "ESCUELA 1" in texto
    assert "SAN MARTIN 100" in texto
    assert "42" in texto
    assert "7" in texto


def test_formatear_resultado_omite_campos_ausentes_sin_imprimir_none():
    texto = formatear_resultado({"mesa": 42})
    assert "None" not in texto
    assert "42" in texto
