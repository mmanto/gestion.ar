"""
Tests de public_sources_service (fuentes públicas en vivo del chat: SIBOM y
farmacias de turno del municipio).

Los parsers se prueban contra recortes literales del HTML real (ver
fixtures_public_sources_html.py), sin red: el caso que más importa es que el
listado de farmacias anida un <ul> dentro de cada <address>, así que recortar
el listado en el primer </ul> devolvía sólo la farmacia de hoy y perdía el
resto de la semana.

El resto cubre el contrato de las funciones públicas y de los executors: nunca
levantan excepción (siempre devuelven un dict serializable con "error" cuando
la fuente falla), usan la caché Redis y no tocan la red si los argumentos del
LLM son inválidos.
"""

import httpx
import pytest

from app.models.bot import BotConfig, PublicSourcesConfig
from app.services import public_sources_service as mod
from app.services.public_sources_service import (
    AUTORIDADES_TOOL_NAME,
    FARMACIA_TOOL_NAME,
    MAX_TEXTO_CARACTERES,
    SIBOM_TOOL_NAME,
    build_public_sources_tools,
    get_autoridades,
    get_farmacias_turno,
    parse_autoridades,
    parse_farmacias,
    parse_sibom_content,
    parse_sibom_results,
    search_sibom,
)
from fixtures_public_sources_html import (
    AUTORIDADES_HTML,
    FARMACIAS_HTML,
    SIBOM_CONTENT_HTML,
    SIBOM_SEARCH_HTML,
)

MUNICIPAL_URL = "https://www.bolivar.gob.ar/"


class FakeRedis:
    """Superficie mínima de redis.Redis usada por el servicio."""

    def __init__(self) -> None:
        self.data: dict[str, str] = {}

    def ping(self) -> bool:
        return True

    def setex(self, key, ttl, value) -> None:
        del ttl  # no usado en el fake
        self.data[key] = value

    def get(self, key):
        return self.data.get(key)


@pytest.fixture
def cache(monkeypatch):
    """Caché en memoria. El cliente es perezoso (una conexión por proceso): se
    resetean los globales para que cada test conecte contra el fake."""
    creados = []

    def _from_url(url, decode_responses):
        creados.append(url)
        return FakeRedis()

    monkeypatch.setattr(mod.redis, "from_url", _from_url)
    mod._cache_client = None
    mod._cache_attempted = False
    yield creados
    mod._cache_client = None
    mod._cache_attempted = False


# ---------------------------------------------------------------------------
# Config del bot (es lo que habilita las tools en el chat web)
# ---------------------------------------------------------------------------

def test_bot_config_parsea_public_sources():
    # El bloque llega desde el JSONB de la fila: sin el campo en BotConfig,
    # _build_llm_tools revienta con AttributeError y el chat contesta el
    # fallback (regresión real detectada en prod).
    assert BotConfig().public_sources is None

    config = BotConfig(
        public_sources={"sibom_city_id": 15, "municipal_url": "https://www.bolivar.gob.ar/"}
    )
    assert config.public_sources == PublicSourcesConfig()

    # Un bloque vacío cargado a mano en el panel tampoco rompe la carga del bot.
    assert BotConfig(public_sources={}).public_sources == PublicSourcesConfig()


# ---------------------------------------------------------------------------
# Parsers
# ---------------------------------------------------------------------------

def test_parse_sibom_results():
    resultados = parse_sibom_results(SIBOM_SEARCH_HTML)

    # Tres bloques en el HTML: el último no tiene enlace y se saltea sin romper
    # el parseo de los anteriores.
    assert len(resultados) == 2
    assert resultados[0] == {
        "url": "https://sibom.slyt.gba.gob.ar/bulletins/628/contents/1187339",
        "titulo": "Ordenanza Nº2459 en el boletín 19º de Bolivar",
        "tipo": "Ordenanza",
        "numero": "2459",
        "boletin": "19º",
        "fecha": "01/02/2018",
    }
    assert resultados[1]["numero"] == "2468"
    assert resultados[1]["url"].endswith("/bulletins/628/contents/1187395")


def test_parse_sibom_content_excluye_el_pie_de_pagina():
    datos = parse_sibom_content(SIBOM_CONTENT_HTML)

    assert datos["titulo"] == "Ordenanza Nº2459"
    assert datos["fecha"] == "Bolivar, 04/12/2017"
    assert datos["tipo"] == "ORDENANZA"
    assert "ARTICULO 1º" in datos["texto"]
    assert "Políticas de privacidad" not in datos["texto"]
    assert datos["texto_truncado"] is False


def test_parse_sibom_content_recorta_el_texto_largo():
    cuerpo = "<p>" + ("palabra " * 400) + "</p>"
    datos = parse_sibom_content(
        'id="frontend-container"><h1 class="title">Decreto Nº1</h1>' + cuerpo + "<footer>x</footer>"
    )

    assert len(datos["texto"]) == MAX_TEXTO_CARACTERES
    assert datos["texto_truncado"] is True


def test_parse_sibom_content_devuelve_vacio_si_no_esta_el_titulo():
    assert parse_sibom_content("<html><body><p>Sin contenedor</p></body></html>") == {}


def test_parse_farmacias_recorre_la_semana_completa():
    farmacias = parse_farmacias(FARMACIAS_HTML)

    # El listado de cada farmacia anida <ul><li>dirección</li><li>teléfono</li></ul>:
    # el listado entero tiene que salir completo, no sólo la primera.
    assert len(farmacias) == 5
    assert farmacias[0] == {
        "dia": "JUE 10",
        "farmacia": "IGLESIAS",
        "direccion": "Av. Venezuela 546",
        "telefono": "(02314) 426205",
        "es_hoy": True,
    }
    assert [f["es_hoy"] for f in farmacias] == [True, False, False, False, False]
    assert farmacias[1]["farmacia"] == "TRES DE FEBRERO"
    assert farmacias[1]["telefono"] == "(02314) 420404"
    assert farmacias[4]["dia"] == "LUN 14"


def test_parse_farmacias_sin_listado():
    assert parse_farmacias("<html><body>sin farmacias</body></html>") == []


def test_parse_autoridades():
    datos = parse_autoridades(AUTORIDADES_HTML)

    assert datos["intendente"] == {"nombre": "Eduardo Luján Bucca", "cargo": "Intendente"}
    assert len(datos["autoridades"]) == 10
    assert datos["autoridades"][0] == {
        "area": "Protección Ciudadana y Defensa Civil",
        "nombre": "Roque Bazán",
        "cargo": "Director de Protección Ciudadana y Defensa Civil",
        "direccion": "Av. Fabrés García 702",
        "telefonos": ["2314-482404", "2314-421780"],
    }
    # Las áreas se repiten en cada persona, y una persona sin teléfono no
    # inventa la clave.
    areas = {p["area"] for p in datos["autoridades"]}
    assert areas == {"Protección Ciudadana y Defensa Civil", "Secretaría de Hacienda"}
    jefa = next(p for p in datos["autoridades"] if p["nombre"] == "María Emilia Pavia")
    assert jefa["cargo"] == "Jefa de Compras"
    assert jefa["telefonos"] == ["2314-482505"]
    secretario = next(p for p in datos["autoridades"] if p["nombre"] == "Javier Erreca")
    assert secretario["cargo"] == "Secretario"
    assert "telefonos" not in secretario


def test_parse_autoridades_sin_listado():
    assert parse_autoridades("<html><body><h1>Autoridades</h1></body></html>") == {}


def test_get_autoridades_filtra_sin_acentos(cache, monkeypatch):
    monkeypatch.setattr(mod, "_fetch_html", lambda url, params=None: AUTORIDADES_HTML)

    completo = get_autoridades(MUNICIPAL_URL)
    filtrado = get_autoridades(MUNICIPAL_URL, "proteccion ciudadana")
    inexistente = get_autoridades(MUNICIPAL_URL, "turismo")

    assert completo["fuente"] == "https://www.bolivar.gob.ar/autoridades/"
    assert len(completo["autoridades"]) == 10
    assert [p["nombre"] for p in filtrado["autoridades"]] == ["Roque Bazán"]
    assert filtrado["filtro"] == "proteccion ciudadana"
    # Un filtro que no coincide devuelve el listado completo, no una lista vacía.
    assert len(inexistente["autoridades"]) == 10
    assert "turismo" in inexistente["nota"]


def test_get_autoridades_devuelve_error_si_cambia_el_markup(cache, monkeypatch):
    monkeypatch.setattr(mod, "_fetch_html", lambda url, params=None: "<html><body>rediseño</body></html>")

    resultado = get_autoridades(MUNICIPAL_URL)

    assert resultado["error"].startswith("No se pudo consultar el listado de autoridades")
    assert resultado["url"] == "https://www.bolivar.gob.ar/autoridades/"


# ---------------------------------------------------------------------------
# Consultas: caché, tipo de norma y fallos
# ---------------------------------------------------------------------------

@pytest.fixture
def sibom_offline(monkeypatch):
    """Reemplaza la red por las fixtures y registra las llamadas (url, params)."""
    llamadas = []

    def _fetch(url, params=None):
        llamadas.append((url, params))
        return SIBOM_CONTENT_HTML if params is None else SIBOM_SEARCH_HTML

    monkeypatch.setattr(mod, "_fetch_html", _fetch)
    return llamadas


def test_search_sibom_cachea_la_busqueda_y_el_contenido(cache, sibom_offline):
    primero = search_sibom(15, "ordenanza 2459", "ordenanza")
    segundo = search_sibom(15, "ordenanza 2459", "ordenanza")

    assert primero == segundo
    # Dos fetches reales (listado + contenido de la primera norma) y ninguno en
    # la segunda consulta, que sale entera de la caché.
    assert len(sibom_offline) == 2
    assert sibom_offline[0] == (
        "https://sibom.slyt.gba.gob.ar/advanced_search",
        {
            "q[terms][bulletin.city_id]": "15",
            "q[simple_query_string]": "ordenanza 2459",
            "page": "1",
            "q[terms][type]": "Ordinance",
        },
    )
    assert sibom_offline[1][0] == "https://sibom.slyt.gba.gob.ar/bulletins/628/contents/1187339"
    assert cache, "el servicio debe haber abierto el cliente de caché"

    assert primero["resultados"][0]["numero"] == "2459"
    assert "ARTICULO 1º" in primero["resultados"][0]["texto"]
    assert primero["resultados"][0]["fecha_norma"] == "Bolivar, 04/12/2017"
    assert primero["url_busqueda"] == (
        "https://sibom.slyt.gba.gob.ar/advanced_search"
        "?q%5Bterms%5D%5Bbulletin.city_id%5D=15&q%5Bsimple_query_string%5D=ordenanza%202459"
    )
    # SIBOM ordena por relevancia y arranca en 2016: el resultado tiene que
    # decirlo, para que el modelo no concluya que una norma no existe.
    assert "2016" in primero["nota"]


def test_search_sibom_sin_resultados_avisa_que_no_implica_que_no_exista(cache, monkeypatch):
    monkeypatch.setattr(mod, "_fetch_html", lambda url, params=None: "<html>sin resultados</html>")

    resultado = search_sibom(15, "ordenanza 2130")

    assert resultado["resultados"] == []
    assert "no implica que la norma no exista" in resultado["nota"]


def test_search_sibom_devuelve_error_si_falla_la_red(cache, monkeypatch):
    def _fetch(url, params=None):
        raise httpx.ConnectError("sin ruta al host")

    monkeypatch.setattr(mod, "_fetch_html", _fetch)

    resultado = search_sibom(15, "ordenanza 2459")

    assert "error" in resultado
    assert resultado["url_busqueda"] == (
        "https://sibom.slyt.gba.gob.ar/advanced_search"
        "?q%5Bterms%5D%5Bbulletin.city_id%5D=15&q%5Bsimple_query_string%5D=ordenanza%202459"
    )


def test_search_sibom_ignora_un_tipo_desconocido(cache, sibom_offline):
    search_sibom(15, "ordenanza 2459", "ley")

    assert "q[terms][type]" not in sibom_offline[0][1]


def test_get_farmacias_turno_devuelve_hoy_y_semana(cache, monkeypatch):
    monkeypatch.setattr(mod, "_fetch_html", lambda url, params=None: FARMACIAS_HTML)

    hoy = get_farmacias_turno(MUNICIPAL_URL)
    semana = get_farmacias_turno(MUNICIPAL_URL, "semana")

    assert hoy["fuente"] == MUNICIPAL_URL
    assert hoy["hoy"]["farmacia"] == "IGLESIAS"
    assert "semana" not in hoy
    assert [f["farmacia"] for f in semana["semana"]] == [
        "IGLESIAS", "TRES DE FEBRERO", "COMAS", "FAL", "PASTEUR",
    ]
    assert semana["hoy"] == hoy["hoy"]


def test_get_farmacias_turno_devuelve_error_si_cambia_el_markup(cache, monkeypatch):
    monkeypatch.setattr(mod, "_fetch_html", lambda url, params=None: "<html><body>rediseño</body></html>")

    resultado = get_farmacias_turno(MUNICIPAL_URL)

    assert resultado == {
        "error": "No se pudo consultar el sitio del municipio en este momento.",
        "url": MUNICIPAL_URL,
    }


# ---------------------------------------------------------------------------
# Executors (contrato con el loop de tools del LLM)
# ---------------------------------------------------------------------------

def test_executors_validan_los_argumentos_sin_tocar_la_red(cache, monkeypatch):
    def _fetch(url, params=None):
        raise AssertionError("los argumentos inválidos no deben llegar a la red")

    monkeypatch.setattr(mod, "_fetch_html", _fetch)

    tools, executors = build_public_sources_tools(PublicSourcesConfig())

    assert [tool["name"] for tool in tools] == [SIBOM_TOOL_NAME, FARMACIA_TOOL_NAME, AUTORIDADES_TOOL_NAME]
    assert set(executors) == {SIBOM_TOOL_NAME, FARMACIA_TOOL_NAME, AUTORIDADES_TOOL_NAME}
    assert executors[SIBOM_TOOL_NAME](SIBOM_TOOL_NAME, {"consulta": "   "}) == {
        "error": "Falta el número o el tema a buscar."
    }
    assert executors[SIBOM_TOOL_NAME](SIBOM_TOOL_NAME, {}) == {
        "error": "Falta el número o el tema a buscar."
    }
    assert executors[SIBOM_TOOL_NAME]("otra_tool", {"consulta": "x"}) == {"error": "Tool desconocida: otra_tool"}
    assert executors[FARMACIA_TOOL_NAME]("otra_tool", {}) == {"error": "Tool desconocida: otra_tool"}
    assert executors[AUTORIDADES_TOOL_NAME]("otra_tool", {}) == {"error": "Tool desconocida: otra_tool"}


def test_executor_autoridades_usa_la_url_del_municipio_y_filtra(cache, monkeypatch):
    urls = []

    def _fetch(url, params=None):
        urls.append(url)
        return AUTORIDADES_HTML

    monkeypatch.setattr(mod, "_fetch_html", _fetch)
    _, executors = build_public_sources_tools(PublicSourcesConfig(municipal_url="https://www.bolivar.gob.ar/"))

    resultado = executors[AUTORIDADES_TOOL_NAME](AUTORIDADES_TOOL_NAME, {"area": "Hacienda"})

    assert urls == ["https://www.bolivar.gob.ar/autoridades/"]
    assert len(resultado["autoridades"]) == 9
    assert {p["area"] for p in resultado["autoridades"]} == {"Secretaría de Hacienda"}
    # Sin filtro devuelve el listado completo (la llamada sale de la caché).
    completo = executors[AUTORIDADES_TOOL_NAME](AUTORIDADES_TOOL_NAME, {})
    assert len(completo["autoridades"]) == 10
    assert len(urls) == 1


def test_executor_sibom_usa_el_city_id_de_la_config(cache, sibom_offline):
    _, executors = build_public_sources_tools(PublicSourcesConfig(sibom_city_id=15))

    resultado = executors[SIBOM_TOOL_NAME](SIBOM_TOOL_NAME, {"consulta": " ordenanza 2459 ", "tipo": "ordenanza"})

    assert sibom_offline[0][1]["q[terms][bulletin.city_id]"] == "15"
    # Los espacios del argumento del LLM no viajan a la consulta.
    assert sibom_offline[0][1]["q[simple_query_string]"] == "ordenanza 2459"
    assert resultado["resultados"][0]["numero"] == "2459"


def test_executor_farmacia_ignora_un_dia_desconocido(cache, monkeypatch):
    monkeypatch.setattr(mod, "_fetch_html", lambda url, params=None: FARMACIAS_HTML)
    _, executors = build_public_sources_tools(PublicSourcesConfig())

    resultado = executors[FARMACIA_TOOL_NAME](FARMACIA_TOOL_NAME, {"dia": "mañana"})

    assert resultado["hoy"]["farmacia"] == "IGLESIAS"
