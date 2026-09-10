"""
Fuentes públicas en vivo para el chat: Boletín Oficial Municipal (SIBOM) y
farmacias de turno del sitio del municipio.

El corpus indexado del RAG (ver ADR-016) es estático: no ve nada publicado
después de indexar. Este servicio le da al LLM dos consultas contra fuentes
oficiales en el momento de la conversación, expuestas como tools cuando el bot
tiene `config.public_sources` (ver BotConfig / PublicSourcesConfig):

  - `buscar_norma_publicada` → búsqueda de normas en SIBOM (`sibom.slyt.gba.gob.ar`),
    el registro donde el municipio publica ordenanzas, decretos y resoluciones
    desde 2016, con el texto completo de cada una.
  - `farmacia_de_turno` → listado semanal de farmacias de turno del sitio del
    municipio (`bolivar.gob.ar`, servido en el HTML, sin JS ni credenciales).
  - `autoridades_municipales` → listado oficial de autoridades del municipio
    (intendente, y por área secretarios, directores y jefes, con cargo y
    contactos) de la página `/autoridades` del sitio del municipio.

Todo el módulo es SÍNCRONO: lo llaman los executors de tools, que ya corren en
el thread de `asyncio.to_thread` de `sync_generate` (ver
prospect_auto_qualify_service.py) — no hay event loop propio ni acceso a la
base, así que no hace falta el puente `run_coroutine_threadsafe`.

Dos invariantes:

  1. Ninguna función pública levanta excepción: devuelve un dict con `"error"`
     (y la URL oficial) cuando la fuente no responde o cambió el markup. El
     resultado se serializa con `json.dumps` en el loop de tools del proveedor,
     así que tiene que ser JSON siempre.
  2. La caché Redis es OPCIONAL y se degrada en silencio a "sin caché" (una
     consulta por turno) — mismo criterio que oauth_login_store.py.
"""

import hashlib
import html
import json
import logging
import os
import re
import unicodedata
from typing import Callable, Dict, List, Optional, Tuple
from urllib.parse import quote, urljoin

import httpx
import redis

from app.models.bot import PublicSourcesConfig

logger = logging.getLogger(__name__)

SIBOM_BASE_URL = "https://sibom.slyt.gba.gob.ar"
USER_AGENT = "gestionar-pachoteayuda/1.0 (+https://pachoteayuda.ar)"
HTTP_TIMEOUT = 8.0

# Prefijo versionado: al cambiar un parser hay que subirlo a v2 para invalidar
# lo cacheado con el formato viejo.
CACHE_PREFIX = "public_sources:v1:"
SIBOM_SEARCH_TTL = 86400      # 24 h — el boletín cambia como mucho a diario
SIBOM_CONTENT_TTL = 604800    # 7 días — una norma publicada ya no cambia
FARMACIA_TTL = 3600           # 1 h — el listado es semanal, pero hoy/mañana cambia
AUTORIDADES_TTL = 86400       # 24 h — los cargos cambian con los cambios de gestión

# Página de autoridades del sitio del municipio, relativa a
# PublicSourcesConfig.municipal_url.
AUTORIDADES_PATH = "autoridades/"

MAX_RESULTADOS = 5
# Recorte del texto completo de SIBOM que viaja al contexto del LLM: alcanza
# para leer el objeto de la norma sin inflar el prompt (el enlace va aparte).
MAX_TEXTO_CARACTERES = 1500

SIBOM_TIPOS = {
    "ordenanza": "Ordinance",
    "decreto": "Decree",
    "resolucion": "Resolution",
}


# ---------------------------------------------------------------------------
# Caché (Redis opcional)
# ---------------------------------------------------------------------------

_cache_client: Optional["redis.Redis"] = None
_cache_attempted = False


def _get_cache() -> Optional["redis.Redis"]:
    """
    Cliente Redis perezoso, creado una vez por proceso (evita abrir una
    conexión nueva en cada consulta). Si Redis no está disponible devuelve None
    y el servicio sigue funcionando sin caché.
    """
    global _cache_client, _cache_attempted
    if not _cache_attempted:
        _cache_attempted = True
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        try:
            _cache_client = redis.from_url(redis_url, decode_responses=True)
            _cache_client.ping()
        except Exception:
            logger.error(
                "PublicSources: no se pudo conectar a Redis (%s) — consultas a fuentes públicas sin caché",
                redis_url,
            )
            _cache_client = None
    return _cache_client


def _cache_get(key: str) -> Optional[dict]:
    client = _get_cache()
    if not client:
        return None
    try:
        raw = client.get(key)
    except Exception:
        logger.warning("PublicSources: no se pudo leer la caché (%s) — se consulta la fuente", key)
        return None
    if not raw:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        logger.warning("PublicSources: caché corrupta en (%s) — se consulta la fuente", key)
        return None


def _cache_set(key: str, payload: dict, ttl: int) -> None:
    client = _get_cache()
    if not client:
        return
    try:
        client.setex(key, ttl, json.dumps(payload, ensure_ascii=False))
    except Exception:
        logger.warning("PublicSources: no se pudo escribir la caché (%s)", key)


# ---------------------------------------------------------------------------
# Red y texto
# ---------------------------------------------------------------------------

def _fetch_html(url: str, params: Optional[dict] = None) -> str:
    """GET plano con UA propio. Levanta httpx.HTTPError si la fuente falla."""
    with httpx.Client(
        timeout=HTTP_TIMEOUT,
        headers={"User-Agent": USER_AGENT},
        follow_redirects=True,
    ) as client:
        response = client.get(url, params=params)
        response.raise_for_status()
        return response.text


def _plain_text(markup: str) -> str:
    """Saca etiquetas y entidades HTML y colapsa los espacios (incluye &nbsp;)."""
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", markup))).strip()


def _normalizar(texto: str) -> str:
    """Minúsculas y sin acentos, para comparar nombres de áreas y cargos."""
    sin_tildes = unicodedata.normalize("NFKD", texto.lower())
    return "".join(c for c in sin_tildes if not unicodedata.combining(c))


def _ul_region(markup: str, start: int) -> str:
    """
    Recorta desde `start` hasta el `</ul>` que CIERRA el <ul> que lo contiene.

    Cada farmacia anida `<address><ul><li>dirección</li><li>teléfono</li></ul>`,
    así que el primer `</ul>` después del listado no lo cierra: hay que
    balancear etiquetas. `start` apunta dentro de la etiqueta de apertura del
    listado, por eso el cierre del listado se ve con profundidad 0.
    """
    depth = 0
    pos = start
    while True:
        apertura = markup.find("<ul", pos)
        cierre = markup.find("</ul>", pos)
        if cierre == -1:
            return markup[start:]
        if apertura != -1 and apertura < cierre:
            depth += 1
            pos = apertura + 3
        elif depth == 0:
            return markup[start:cierre]
        else:
            depth -= 1
            pos = cierre + 5


# ---------------------------------------------------------------------------
# Parsers (puros: reciben HTML, no hacen red — unidad testeable)
# ---------------------------------------------------------------------------

def parse_sibom_results(markup: str) -> List[dict]:
    """
    Resultados del listado de `/advanced_search`.

    Cada resultado es `<div class="search-result">` con
    `<p class="content-title"><a href="/bulletins/<b>/contents/<c>">Título</a></p>`
    y la fecha de publicación en `<span class="text-muted">`. Un bloque sin
    enlace ni título se saltea sin romper el parseo del resto.
    """
    resultados = []
    for bloque in re.split(r'<div class="search-result">', markup)[1:]:
        link = re.search(r'<p class="content-title"><a href="([^"]+)"[^>]*>([^<]+)</a>', bloque)
        if not link:
            continue
        href = link.group(1)
        titulo = _plain_text(link.group(2))
        if not href or not titulo:
            continue

        fecha = re.search(r'<span class="text-muted">([^<]+)</span>', bloque)
        numero = re.search(r"N[º°]\s*([\d.]+)", titulo)
        boletin = re.search(r"bolet[ií]n(?:es)?\s+(\d+[º°]?)", titulo)
        resultados.append({
            "url": SIBOM_BASE_URL + href if href.startswith("/") else href,
            "titulo": titulo,
            "tipo": titulo.split()[0],
            "numero": numero.group(1) if numero else None,
            "boletin": boletin.group(1) if boletin else None,
            "fecha": fecha.group(1).strip() if fecha else None,
        })
    return resultados


def parse_sibom_content(markup: str) -> dict:
    """
    Contenido de una norma (`/bulletins/<b>/contents/<c>`): título, ciudad y
    fecha, tipo y el cuerpo hasta el pie de página. Devuelve {} si falta el
    título o el texto — el caller lo trata como fallo de parseo.
    """
    i = markup.find('id="frontend-container"')
    if i == -1:
        return {}
    j = markup.find("<footer", i)
    seg = markup[i:] if j == -1 else markup[i:j]

    titulo_m = re.search(r'<h1 class="title">(.*?)</h1>', seg, re.S)
    if not titulo_m:
        return {}
    titulo = _plain_text(titulo_m.group(1))
    if not titulo:
        return {}

    fecha_m = re.search(r'<p class="city-and-date">(.*?)</p>', seg, re.S)
    tipo_m = re.search(r'<p class="ordinance">(.*?)</p>', seg, re.S)
    cuerpo = seg[tipo_m.end():] if tipo_m else seg[titulo_m.end():]

    completo = _plain_text(cuerpo)
    if not completo:
        return {}

    return {
        "titulo": titulo,
        "fecha": _plain_text(fecha_m.group(1)) if fecha_m else None,
        "tipo": _plain_text(tipo_m.group(1)) if tipo_m else None,
        "texto": completo[:MAX_TEXTO_CARACTERES],
        "texto_truncado": len(completo) > MAX_TEXTO_CARACTERES,
    }


def parse_farmacias(markup: str) -> List[dict]:
    """
    Farmacias de turno del sitio del municipio: el listado semanal completo
    (hoy + los próximos días) de `<ul id="listafarmacias">`. La de hoy es la
    que lleva `de-turno` en su bloque. Lista vacía si el listado no está.
    """
    i = markup.find('id="listafarmacias"')
    if i == -1:
        return []

    bloque = _ul_region(markup, i)
    farmacias = []
    for li in re.split(r'<li class="farmacia', bloque)[1:]:
        nombre_m = re.search(r"<h4>(.*?)</h4>", li, re.S)
        if not nombre_m:
            continue
        dia_m = re.search(r"<h3>(.*?)</h3>", li, re.S)
        address_m = re.search(r"<address>(.*?)</address>", li, re.S)
        datos = re.findall(r"<li>(.*?)</li>", address_m.group(1), re.S) if address_m else []
        farmacias.append({
            "dia": _plain_text(dia_m.group(1)) if dia_m else None,
            "farmacia": _plain_text(nombre_m.group(1)),
            "direccion": _plain_text(datos[0]) if datos else None,
            "telefono": _plain_text(datos[1]) if len(datos) > 1 else None,
            "es_hoy": bool(re.search(r'class="fw[^"]*\bde-turno\b', li)),
        })
    return farmacias


def _contacto(tarjeta: str) -> dict:
    """Dirección, teléfonos y mails del bloque `<div class="card-contacto">` de una tarjeta."""
    bloque = re.search(r'<div class="card-contacto">(.*?)</div>', tarjeta, re.S)
    if not bloque:
        return {}

    contacto = bloque.group(1)
    direccion = re.search(r'ti-map-pin"></i><span>(.*?)</span>', contacto, re.S)
    telefonos = re.findall(r'<a href="tel:[^"]*">(.*?)</a>', contacto, re.S)
    emails = re.findall(r'<a href="mailto:[^"]*">(.*?)</a>', contacto, re.S)

    datos: dict = {}
    if direccion:
        datos["direccion"] = _plain_text(direccion.group(1))
    if telefonos:
        datos["telefonos"] = [_plain_text(t) for t in telefonos]
    if emails:
        datos["emails"] = [_plain_text(e) for e in emails]
    return datos


def parse_autoridades(markup: str) -> dict:
    """
    Autoridades del municipio (`/autoridades`): el intendente y, por área, cada
    secretario, director o jefe con su cargo y contactos.

    El listado va como `<h2>` — primero el nombre del intendente, después el
    nombre de cada área — y dentro de cada área, tarjetas
    `<div class="carousel-card">` con el nombre en `<h3>` y el cargo en `<h4>`.
    El intendente es la excepción: su `<h2>` es el nombre y el `<h3>` el cargo
    (por eso se detecta como el primer `<h2>` sin tarjetas). Devuelve {} si el
    listado no está.
    """
    i = markup.find('id="autoridades"')
    if i == -1:
        return {}
    j = markup.find("<footer", i)
    seg = markup[i:] if j == -1 else markup[i:j]

    partes = re.split(r"<h2>(.*?)</h2>", seg, flags=re.S)
    intendente: Optional[dict] = None
    autoridades: List[dict] = []
    for titulo, cuerpo in zip(partes[1::2], partes[2::2]):
        if intendente is None and '<div class="carousel-card' not in cuerpo:
            cargo_m = re.search(r"<h3>(.*?)</h3>", cuerpo, re.S)
            intendente = {
                "nombre": _plain_text(titulo),
                "cargo": _plain_text(cargo_m.group(1)) if cargo_m else None,
            }
            continue

        area = _plain_text(titulo)
        for tarjeta in re.split(r'<div class="carousel-card', cuerpo)[1:]:
            nombre_m = re.search(r"<h3>(.*?)</h3>", tarjeta, re.S)
            if not nombre_m:
                continue
            cargo_m = re.search(r"<h4>(.*?)</h4>", tarjeta, re.S)
            autoridades.append({
                "area": area,
                "nombre": _plain_text(nombre_m.group(1)),
                "cargo": _plain_text(cargo_m.group(1)) if cargo_m else None,
                **_contacto(tarjeta),
            })

    if intendente is None and not autoridades:
        return {}
    return {"intendente": intendente, "autoridades": autoridades}


# ---------------------------------------------------------------------------
# Consultas (caché + red + manejo de error)
# ---------------------------------------------------------------------------

def _sibom_search_url(city_id: int, consulta: str) -> str:
    """
    URL de la búsqueda armada a mano (no la del httpx con dict) porque es la que
    el modelo puede citarle al vecino. Sin filtro de tipo: los tipos válidos de
    SIBOM son códigos en inglés (`Ordinance`), no sirven en un enlace público.
    """
    return (
        f"{SIBOM_BASE_URL}/advanced_search?q%5Bterms%5D%5Bbulletin.city_id%5D={city_id}"
        f"&q%5Bsimple_query_string%5D={quote(consulta)}"
    )


def _sibom_content(contenido_url: str) -> dict:
    """Contenido completo de una norma, cacheado por boletín+contenido."""
    ids = re.search(r"/bulletins/(\d+)/contents/(\d+)", contenido_url)
    if not ids:
        return {}
    clave = f"{CACHE_PREFIX}sibom:content:{ids.group(1)}:{ids.group(2)}"
    cacheado = _cache_get(clave)
    if cacheado is not None:
        return cacheado

    try:
        datos = parse_sibom_content(_fetch_html(contenido_url))
    except httpx.HTTPError as exc:
        logger.warning("PublicSources: falló la lectura de la norma en SIBOM (%s): %s", contenido_url, exc)
        return {}
    if datos:
        _cache_set(clave, datos, SIBOM_CONTENT_TTL)
    return datos


def search_sibom(city_id: int, consulta: str, tipo: Optional[str] = None) -> dict:
    """
    Busca `consulta` en los boletines de un municipio de SIBOM y devuelve hasta
    MAX_RESULTADOS normas, con el texto (recortado) de la primera.

    `tipo` es uno de SIBOM_TIPOS ("ordenanza" | "decreto" | "resolucion");
    cualquier otro valor se ignora. Nunca levanta: ante un fallo de red devuelve
    `{"error": ..., "url_busqueda": ...}`.
    """
    url_busqueda = _sibom_search_url(city_id, consulta)
    clave = CACHE_PREFIX + "sibom:search:" + hashlib.sha1(
        f"{city_id}|{consulta}|{tipo or ''}".encode("utf-8")
    ).hexdigest()
    cacheado = _cache_get(clave)
    if cacheado is not None:
        return cacheado

    params = {
        "q[terms][bulletin.city_id]": str(city_id),
        "q[simple_query_string]": consulta,
        "page": "1",
    }
    tipo_sibom = SIBOM_TIPOS.get(tipo or "")
    if tipo_sibom:
        params["q[terms][type]"] = tipo_sibom

    try:
        resultados = parse_sibom_results(
            _fetch_html(f"{SIBOM_BASE_URL}/advanced_search", params)
        )[:MAX_RESULTADOS]
    except httpx.HTTPError as exc:
        logger.warning("PublicSources: falló la búsqueda en SIBOM (%r): %s", consulta, exc)
        return {
            "error": "No se pudo consultar el Boletín Oficial Municipal (SIBOM) en este momento.",
            "url_busqueda": url_busqueda,
        }

    if resultados:
        contenido = _sibom_content(resultados[0]["url"])
        if contenido:
            texto = contenido["texto"]
            if contenido.get("texto_truncado"):
                texto += " [… recorte del texto completo, disponible en el enlace oficial]"
            resultados[0]["texto"] = texto
            resultados[0]["fecha_norma"] = contenido.get("fecha")

    resultado = {
        "fuente": "Boletín Oficial Municipal (SIBOM)",
        "consulta": consulta,
        "resultados": resultados,
        "url_busqueda": url_busqueda,
        # SIBOM no hace coincidencia exacta: ordena por relevancia y publica
        # desde 2016. Sin esta aclaración el modelo puede concluir que una norma
        # que no aparece (o que aparece rodeada de normas parecidas) no existe o
        # que el bot no la tiene — el caso de las normas anteriores a 2016, que
        # sólo están en el corpus del HCD.
        "nota": (
            "Sin coincidencias en SIBOM, que publica boletines desde 2016: no implica que la norma "
            "no exista. Respondé con la información que ya tenés."
            if not resultados
            else "SIBOM ordena por relevancia (puede devolver normas parecidas) y publica desde 2016: "
                 "si la norma buscada no aparece en estos resultados, no implica que no exista."
        ),
    }
    _cache_set(clave, resultado, SIBOM_SEARCH_TTL)
    return resultado


def get_farmacias_turno(municipal_url: str, dia: str = "hoy") -> dict:
    """
    Farmacias de turno según el sitio del municipio. Se cachea el listado
    semanal completo; `dia="hoy"` (default) devuelve sólo la de hoy y
    `dia="semana"` el listado completo (que también incluye `hoy`).
    Nunca levanta: ante un fallo devuelve `{"error": ..., "url": ...}`.
    """
    clave = CACHE_PREFIX + "farmacia:" + hashlib.sha1(municipal_url.encode("utf-8")).hexdigest()
    datos = _cache_get(clave)
    if datos is None:
        try:
            farmacias = parse_farmacias(_fetch_html(municipal_url))
        except httpx.HTTPError as exc:
            logger.warning("PublicSources: falló la consulta del sitio del municipio (%s): %s", municipal_url, exc)
            return {
                "error": "No se pudo consultar el sitio del municipio en este momento.",
                "url": municipal_url,
            }
        if not farmacias:
            logger.warning("PublicSources: el sitio del municipio no devolvió el listado de farmacias (%s)", municipal_url)
            return {
                "error": "No se pudo consultar el sitio del municipio en este momento.",
                "url": municipal_url,
            }
        datos = {
            "fuente": municipal_url,
            "hoy": next((f for f in farmacias if f["es_hoy"]), farmacias[0]),
            "semana": farmacias,
        }
        _cache_set(clave, datos, FARMACIA_TTL)

    if dia == "semana":
        return dict(datos)
    return {"fuente": datos["fuente"], "hoy": datos["hoy"]}


def get_autoridades(municipal_url: str, area: Optional[str] = None) -> dict:
    """
    Autoridades del municipio según la página oficial del sitio del municipio.
    `area` (opcional) filtra por área, nombre o cargo, sin acentos ni
    mayúsculas; si no coincide con nada, devuelve el listado completo con una
    nota, para que el modelo pueda responder con lo que hay. Nunca levanta.
    """
    url = urljoin(municipal_url, AUTORIDADES_PATH)
    clave = CACHE_PREFIX + "autoridades:" + hashlib.sha1(url.encode("utf-8")).hexdigest()
    datos = _cache_get(clave)
    if datos is None:
        try:
            datos = parse_autoridades(_fetch_html(url))
        except httpx.HTTPError as exc:
            logger.warning("PublicSources: falló la consulta de autoridades del municipio (%s): %s", url, exc)
            return {
                "error": "No se pudo consultar el listado de autoridades del municipio en este momento.",
                "url": url,
            }
        if not datos:
            logger.warning("PublicSources: el sitio del municipio no devolvió el listado de autoridades (%s)", url)
            return {
                "error": "No se pudo consultar el listado de autoridades del municipio en este momento.",
                "url": url,
            }
        _cache_set(clave, datos, AUTORIDADES_TTL)

    resultado = {"fuente": url, **datos}
    if not area:
        return resultado

    filtro = _normalizar(area)
    coincidencias = [
        persona
        for persona in datos["autoridades"]
        if filtro in _normalizar(
            f"{persona.get('area') or ''} {persona.get('nombre') or ''} {persona.get('cargo') or ''}"
        )
    ]
    if coincidencias:
        return {**resultado, "autoridades": coincidencias, "filtro": area}
    return {
        **resultado,
        "nota": f"Ningún área, nombre o cargo coincide con '{area}': este es el listado completo.",
    }


# ---------------------------------------------------------------------------
# Tools para el LLM
# ---------------------------------------------------------------------------

SIBOM_TOOL_NAME = "buscar_norma_publicada"

SIBOM_TOOL_SPEC = {
    "name": SIBOM_TOOL_NAME,
    "description": (
        "Busca una norma del Partido de Bolívar en el Boletín Oficial Municipal (SIBOM), el registro "
        "oficial donde el municipio publica ordenanzas, decretos y resoluciones desde 2016. Usala "
        "cuando pregunten si una norma está publicada, en qué boletín o en qué fecha salió, o cuando "
        "pidan el texto de una norma que no está en la información disponible. Devolvé siempre el "
        "enlace oficial de lo que encuentres. No la uses para normas anteriores a 2016 ni para trámites."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "consulta": {
                "type": "string",
                "description": "Número de norma (por ejemplo 'ordenanza 2459') o tema a buscar.",
            },
            "tipo": {
                "type": "string",
                "enum": ["ordenanza", "decreto", "resolucion"],
                "description": "Tipo de norma, sólo si el vecino lo mencionó.",
            },
        },
        "required": ["consulta"],
    },
}

FARMACIA_TOOL_NAME = "farmacia_de_turno"

FARMACIA_TOOL_SPEC = {
    "name": FARMACIA_TOOL_NAME,
    "description": (
        "Devuelve las farmacias de turno de San Carlos de Bolívar según el sitio oficial del "
        "municipio, con dirección y teléfono. Llamala SIEMPRE que pregunten qué farmacia está de "
        "turno, hoy o en los próximos días, aunque creas saber la respuesta."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "dia": {
                "type": "string",
                "enum": ["hoy", "semana"],
                "description": (
                    "'hoy' (por defecto) para la farmacia de turno de hoy; 'semana' para el listado "
                    "de los próximos días."
                ),
            },
        },
        "required": [],
    },
}

AUTORIDADES_TOOL_NAME = "autoridades_municipales"

AUTORIDADES_TOOL_SPEC = {
    "name": AUTORIDADES_TOOL_NAME,
    "description": (
        "Devuelve el listado oficial de autoridades del municipio — el intendente y, por área, "
        "secretarios, directores y jefes, con su cargo, dirección y teléfonos — según la página de "
        "Autoridades del sitio del municipio. Llamala SIEMPRE que pregunten quién es el intendente, "
        "un secretario, un director o un jefe de área, o que pidan el listado de funcionarios, "
        "aunque creas saber la respuesta. No incluye concejales: el Concejo Deliberante tiene su "
        "propio sitio."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "area": {
                "type": "string",
                "description": (
                    "Área, secretaría o apellido, sólo si el vecino preguntó por uno puntual "
                    "(por ejemplo 'Salud' o 'Hacienda')."
                ),
            },
        },
        "required": [],
    },
}


def build_public_sources_tools(
    cfg: PublicSourcesConfig,
) -> Tuple[List[dict], Dict[str, Callable[[str, dict], dict]]]:
    """
    Arma los specs y los executors de las fuentes públicas de un bot.

    Mismo contrato que las demás tools del chat: executor síncrono
    `(tool_name, args) -> dict` (corre en el thread de asyncio.to_thread), por lo
    que sólo devuelve datos JSON-serializables.
    """
    def _sibom_executor(tool_name: str, args: dict) -> dict:
        if tool_name != SIBOM_TOOL_NAME:
            return {"error": f"Tool desconocida: {tool_name}"}
        consulta = (args.get("consulta") or "").strip()
        if not consulta:
            return {"error": "Falta el número o el tema a buscar."}
        # Un tipo fuera del mapa se ignora en vez de fallar: la búsqueda sin
        # filtro sigue siendo útil.
        tipo = args.get("tipo") if args.get("tipo") in SIBOM_TIPOS else None
        return search_sibom(cfg.sibom_city_id, consulta, tipo)

    def _farmacia_executor(tool_name: str, args: dict) -> dict:
        if tool_name != FARMACIA_TOOL_NAME:
            return {"error": f"Tool desconocida: {tool_name}"}
        dia = "semana" if args.get("dia") == "semana" else "hoy"
        return get_farmacias_turno(cfg.municipal_url, dia)

    def _autoridades_executor(tool_name: str, args: dict) -> dict:
        if tool_name != AUTORIDADES_TOOL_NAME:
            return {"error": f"Tool desconocida: {tool_name}"}
        area = (args.get("area") or "").strip() or None
        return get_autoridades(cfg.municipal_url, area)

    return (
        [SIBOM_TOOL_SPEC, FARMACIA_TOOL_SPEC, AUTORIDADES_TOOL_SPEC],
        {
            SIBOM_TOOL_NAME: _sibom_executor,
            FARMACIA_TOOL_NAME: _farmacia_executor,
            AUTORIDADES_TOOL_NAME: _autoridades_executor,
        },
    )
