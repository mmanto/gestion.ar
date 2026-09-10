#!/usr/bin/env python3
"""
Genera las páginas públicas de la landing de pachoteayuda.ar a partir de datos
oficiales. Escribe dentro de sites/pachoteayuda-landing/ (el contexto de build
del contenedor landing-pachoteayuda):

    /normas/                            hub del archivo de normas
    /normas/<seccion>/                  índice de la sección
    /normas/<seccion>/<anio>/           listado de un año
    /normas/<seccion>/<anio>/<slug>/    una norma, con su texto y el PDF oficial
    /tramites/                          guía de trámites del municipio
    /tramites/<slug>/                   un trámite, con requisitos oficiales
    sitemap.xml                         todas las URLs generadas

Fuentes (las dos oficiales):
  - corpus JSONL del HCD de Bolívar, producido por scripts/fetch_bolivar_normas.py
    e indexado por backend/scripts/index_bolivar_normas.py. Cada registro:
    {id, seccion, fecha, titulo, numero, url, chars, origen, texto}.
  - Guía de Trámites del sitio del municipio (bolivar.gob.ar/guia-de-tramites).

Uso (en la máquina de trabajo, antes de `docker compose build` de la landing):

    python3 scripts/generate_pachoteayuda_pages.py \
        --corpus /home/mmanto/workspace/bolivar/normas_corpus.jsonl

    # sólo trámites (no necesita corpus, las páginas quedan en el build)
    python3 scripts/generate_pachoteayuda_pages.py --only tramites

Las páginas generadas y el sitemap.xml NO se versionan (ver .gitignore): se
regeneran antes de cada build de landing-pachoteayuda.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

REPO = Path(__file__).resolve().parents[1]
DEFAULT_OUT = REPO / "sites" / "pachoteayuda-landing"

SITE = "https://pachoteayuda.ar"
MUNICIPIO = "https://www.bolivar.gob.ar"
GUIA_URL = f"{MUNICIPIO}/guia-de-tramites"
MUNICIPIO_NOMBRE = "Municipio de San Carlos de Bolívar"
HCD_NOMBRE = "Honorable Concejo Deliberante de San Carlos de Bolívar"
TODAY = date.today().isoformat()

# El sitio del municipio rechaza user agents de bots (403 con el UA del
# servicio de fuentes públicas): con UA de navegador responde normal.
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36")

# Valor de `seccion` en el corpus → (etiqueta visible, prefijo del slug)
SECCIONES = {
    "ordenanzas": ("Ordenanzas", "ordenanza"),
    "decretos": ("Decretos", "decreto"),
    "resoluciones": ("Resoluciones", "resolucion"),
    "comunicaciones": ("Comunicaciones", "comunicacion"),
    "ordenanzas-de-interes": ("Ordenanzas de interés", "ordenanza-de-interes"),
}
ORDEN_SECCIONES = list(SECCIONES)

MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
         "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

# Siglas que se mantienen en mayúsculas al pasar un título oficial a caja baja.
ACRONIMOS = {"hcd", "dnu", "sibom", "arba", "afip", "anses", "cud", "omit",
             "pami", "ioma", "vial", "isft", "unlp", "unlp", "pba", "caba",
             "cuit", "iva", "tv", "fm", "am", "pc", "ong", "s.a.", "srl"}

# Marcadores que el corpus usa para "no hay texto extraíble" (ver fetch).
ORIGENES_SIN_TEXTO = {"scan", "error"}


# ---------------------------------------------------------------------------
# Utilidades de texto
# ---------------------------------------------------------------------------

def esc(value: object) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def normalized(value: str) -> str:
    """Minúsculas sin acentos, para slugs."""
    sin = unicodedata.normalize("NFKD", (value or "").lower())
    return "".join(c for c in sin if not unicodedata.combining(c))


def slugify(value: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", normalized(value)).strip("-")
    return re.sub(r"-{2,}", "-", s)


def clip(value: str, limit: int) -> str:
    value = re.sub(r"\s+", " ", (value or "").strip())
    if len(value) <= limit:
        return value
    return value[: limit - 1].rstrip(" ,;:.") + "…"


def fecha_larga(iso: Optional[str]) -> Optional[str]:
    """2026-08-31 → 31 de agosto de 2026."""
    if not iso:
        return None
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", iso.strip())
    if not m:
        return iso
    anio, mes, dia = m.groups()
    try:
        return f"{int(dia)} de {MESES[int(mes) - 1]} de {anio}"
    except (ValueError, IndexError):
        return iso


def anio_de(rec: Dict) -> str:
    fecha = (rec.get("fecha") or "").strip()
    m = re.match(r"^(\d{4})", fecha)
    return m.group(1) if m else "sin-fecha"


def clean_norma_text(texto: str) -> str:
    """
    Normaliza el texto que sale del PDF (pdftotext -layout): recorta la
    indentación de cada línea, colapsa los espacios internos y deja como mucho
    un blanco entre párrafos. Mismo criterio que clean() de
    backend/scripts/index_bolivar_normas.py, para que la página y el RAG
    muestren el mismo texto.
    """
    texto = (texto or "").replace("\f", "\n")
    texto = "".join(c for c in texto if c in "\n\t" or unicodedata.category(c)[0] != "C")
    lineas: List[str] = []
    blancos = 0
    for linea in texto.split("\n"):
        linea = re.sub(r"[ \t]+", " ", linea).strip()
        blancos = blancos + 1 if not linea else 0
        if blancos <= 2:
            lineas.append(linea)
    return "\n".join(lineas).strip()


def parrafos(texto: str) -> List[str]:
    """Bloques separados por línea en blanco, con los saltos internos intactos."""
    bloques = re.split(r"\n\s*\n", clean_norma_text(texto))
    return [b for b in (bl.strip("\n") for bl in bloques) if b.strip()]


def titulo_legible(titulo: str) -> str:
    """
    Título oficial del corpus tal como viene de la grilla del HCD, sin el número
    adelante y —si está todo en mayúsculas— pasado a caja baja, respetando las
    siglas conocidas.
    """
    t = re.sub(r"^\s*\d{1,5}\s*/\s*\d{2,4}\s*[-–:.]?\s*", "", (titulo or "").strip())
    t = re.sub(r"\s+", " ", t).strip()
    if not t:
        return ""
    letras = [c for c in t if c.isalpha()]
    if not letras or sum(1 for c in letras if c.isupper()) / len(letras) < 0.7:
        return t
    palabras = []
    for palabra in t.lower().split(" "):
        clave = palabra.strip(".,;:()")
        palabras.append(palabra.upper() if clave in ACRONIMOS else palabra)
    out = " ".join(palabras)
    return out[:1].upper() + out[1:]


def numero_slug(numero: str) -> str:
    """3197/26 → 3197-26 (para el slug de la URL)."""
    return re.sub(r"[^0-9a-z]+", "-", normalized(numero or "")).strip("-")


# ---------------------------------------------------------------------------
# Modelo de una norma a partir de un registro del corpus
# ---------------------------------------------------------------------------

class Norma:
    def __init__(self, rec: Dict, slug_extra: str = "") -> None:
        self.rec = rec
        self.seccion = rec.get("seccion") or "ordenanzas"
        self.etiqueta, self.prefijo = SECCIONES.get(
            self.seccion, (self.seccion.replace("-", " ").capitalize(), "norma"))
        self.anio = anio_de(rec)
        self.fecha = (rec.get("fecha") or "").strip() or None
        self.numero = (rec.get("numero") or "").strip()
        self.titulo = titulo_legible(rec.get("titulo") or "")
        self.texto = (rec.get("texto") or "").strip()
        self.url_oficial = (rec.get("url") or "").strip()
        self.sin_texto = (rec.get("origen") in ORIGENES_SIN_TEXTO) or not self.texto
        base = f"{self.prefijo}-{numero_slug(self.numero)}" if self.numero \
            else "norma-" + (rec.get("id") or "").replace("norma_", "")[:10]
        self.slug = base + slug_extra
        self.h1 = (f"{self.etiqueta[:-1].capitalize()} Nº {self.numero}"
                   if self.numero else self.titulo or "Norma del HCD")

    @property
    def path(self) -> str:
        return f"/normas/{self.seccion}/{self.anio}/{self.slug}/"

    @property
    def url(self) -> str:
        return SITE + self.path

    def meta_descripcion(self) -> str:
        """
        Descripción construida desde los metadatos (número, fecha y título
        oficial). No se usa el arranque del texto del PDF: en las normas
        escaneadas las primeras líneas son el encabezado de la memoria del año
        y no describen la norma.
        """
        base = self.h1 + (f" del {fecha_larga(self.fecha)}" if self.fecha else "")
        if self.titulo:
            base += ": " + clip(self.titulo, 80)
        cola = (". Norma sin texto digitalizado: enlace al documento original del archivo del HCD."
                if self.sin_texto else
                ". Texto completo y enlace al documento oficial del HCD de Bolívar.")
        return clip(base + cola, 158)

    def title_tag(self) -> str:
        partes = [self.h1]
        if self.titulo and normalized(self.titulo) not in normalized(self.h1):
            partes.append(clip(self.titulo, 45))
        return clip(" — ".join(partes), 62) + " | Bolívar"

    def orden(self) -> Tuple[str, str]:
        return (self.fecha or "0000-00-00", self.numero or self.slug)


def cargar_normas(path: Path) -> List[Norma]:
    registros = []
    with path.open(encoding="utf-8") as fh:
        for linea in fh:
            linea = linea.strip()
            if linea:
                registros.append(json.loads(linea))

    # Un mismo número puede repetirse dentro de una sección (dos documentos
    # distintos cargados con el mismo número): el segundo slug se desambigua.
    vistos: Dict[str, int] = {}
    normas: List[Norma] = []
    for rec in registros:
        seccion = rec.get("seccion") or "ordenanzas"
        numero = (rec.get("numero") or "").strip()
        clave = f"{seccion}|{numero}" if numero else f"{seccion}|{rec.get('id')}"
        veces = vistos.get(clave, 0)
        vistos[clave] = veces + 1
        normas.append(Norma(rec, slug_extra=f"-{veces + 1}" if veces else ""))

    normas.sort(key=lambda n: (ORDEN_SECCIONES.index(n.seccion)
                               if n.seccion in SECCIONES else len(SECCIONES),
                               n.anio, n.orden()), reverse=False)
    return normas


# ---------------------------------------------------------------------------
# Plantilla HTML
# ---------------------------------------------------------------------------

CHAT_PATH = "/chat/c/channel_96ad03bc1a1d"


def breadcrumbs(items: Sequence[Tuple[str, Optional[str]]]) -> str:
    partes = []
    for i, (nombre, url) in enumerate(items):
        if url and i < len(items) - 1:
            partes.append(f'<a href="{esc(url)}">{esc(nombre)}</a>')
        else:
            partes.append(f"<span>{esc(nombre)}</span>")
    return ('<nav class="breadcrumbs" aria-label="Ruta de navegación">'
            + '<span>›</span>'.join(partes) + "</nav>")


def cta(titulo: str, detalle: str) -> str:
    return f"""
      <aside class="cta">
        <p>{esc(titulo)}<small>{esc(detalle)}</small></p>
        <button type="button" class="btn-chat" data-open-chat>Preguntale al asistente</button>
      </aside>"""


def page(*, title: str, description: str, canonical: str, body: str,
         jsonld: Sequence[Dict] = (), indexable: bool = True) -> str:
    bloques = "\n".join(
        '<script type="application/ld+json">\n'
        + json.dumps(block, ensure_ascii=False, indent=2)
        + "\n</script>" for block in jsonld)
    robots = "index, follow" if indexable else "noindex, follow"
    return f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}" />
<meta name="robots" content="{robots}" />
<link rel="canonical" href="{esc(canonical)}" />
<meta property="og:type" content="article" />
<meta property="og:url" content="{esc(canonical)}" />
<meta property="og:title" content="{esc(title)}" />
<meta property="og:description" content="{esc(description)}" />
<meta property="og:image" content="{SITE}/landing/og-image.png" />
<meta property="og:site_name" content="Pacho Te Ayuda" />
<meta property="og:locale" content="es_AR" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" type="image/png" sizes="32x32" href="/landing/favicon-32.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/landing/apple-touch-icon.png" />
<meta name="theme-color" content="#130a21" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/landing/seo.css" />
{bloques}
</head>
<body>
<header class="site-header">
  <a class="brand" href="/"><img src="/landing/logo.webp" alt="Pacho Te Ayuda" width="558" height="200" /></a>
  <nav>
    <a href="/tramites/">Trámites</a>
    <a href="/normas/">Normas del HCD</a>
    <a href="/">Asistente</a>
  </nav>
</header>
<main class="wrap">
{body}
</main>
<footer class="site-footer">
  <div class="inner">
    <p><strong>Pacho Te Ayuda</strong> — Asistente Ciudadano de Bolívar. Información oficial del {esc(MUNICIPIO_NOMBRE)} y del {esc(HCD_NOMBRE)}.</p>
    <p>Fuentes: <a href="{MUNICIPIO}/" target="_blank" rel="noopener">bolivar.gob.ar</a> · <a href="https://www.hcdbolivar.gob.ar/" target="_blank" rel="noopener">hcdbolivar.gob.ar</a> · <a href="https://sibom.slyt.gba.gob.ar/" target="_blank" rel="noopener">SIBOM</a></p>
  </div>
</footer>
<script>window.__IPA_CHAT__ = {{ openOnLoad: false }};</script>
<script src="/chat-widget.js" defer></script>
<script>
  document.querySelectorAll('[data-open-chat]').forEach(function (btn) {{
    btn.addEventListener('click', function () {{
      if (window.__IPA_OPEN_CHAT__) window.__IPA_OPEN_CHAT__();
    }});
  }});
</script>
</body>
</html>
"""


class Escritor:
    """Escribe páginas y acumula las URLs del sitemap."""

    def __init__(self, out: Path) -> None:
        self.out = out
        self.urls: List[Tuple[str, str]] = []  # (loc, lastmod)

    def write(self, path: str, contenido: str, *, lastmod: str = TODAY,
              sitemap: bool = True) -> None:
        if path == "/":
            raise ValueError("la portada es sites/pachoteayuda-landing/index.html "
                             "(manual): el generador no la escribe")
        destino = self.out / path.strip("/") / "index.html"
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(contenido, encoding="utf-8")
        if sitemap:
            self.urls.append((SITE + ("/" if path == "/" else path), lastmod))

    def sitemap(self) -> None:
        # La portada (index.html) es manual: no la escribe el generador, pero
        # entra igual en el sitemap.
        self.urls.append((SITE + "/", TODAY))
        vistos = {}
        for loc, lastmod in self.urls:
            vistos[loc] = max(lastmod, vistos.get(loc, ""))
        filas = "\n".join(
            f"  <url>\n    <loc>{esc(loc)}</loc>\n    <lastmod>{esc(lastmod)}</lastmod>\n  </url>"
            for loc, lastmod in sorted(vistos.items(), key=lambda kv: kv[0]))
        (self.out / "sitemap.xml").write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            f"{filas}\n</urlset>\n", encoding="utf-8")
        print(f"sitemap.xml: {len(vistos)} URLs")


# ---------------------------------------------------------------------------
# Normas
# ---------------------------------------------------------------------------

def norma_body(norma: Norma, senderos: str, previa: Optional[Norma],
               siguiente: Optional[Norma]) -> str:
    if norma.sin_texto:
        nota = (f'<div class="missing"><p>El texto de esta norma '
                f'<strong>no está digitalizado</strong> en el archivo del Concejo '
                f'Deliberante. Podés consultar el documento original en PDF'
                + (f' y preguntarle al asistente por su contenido.'
                   if norma.url_oficial else '.') + '</p></div>')
        cuerpo = nota
    else:
        cuerpo = ('<div class="norm-text">'
                  + "".join(f"<p>{esc(p)}</p>" for p in parrafos(norma.texto))
                  + "</div>")

    fuente = ""
    if norma.url_oficial:
        fuente = (f'<p class="source">Fuente oficial: '
                  f'<a href="{esc(norma.url_oficial)}" target="_blank" rel="noopener nofollow">'
                  f'documento original en el archivo del HCD</a>.</p>')

    hermanas = []
    if previa:
        hermanas.append(f'<a href="{esc(previa.path)}">← {esc(clip(previa.h1, 42))}</a>')
    if siguiente:
        hermanas.append(f'<a href="{esc(siguiente.path)}">{esc(clip(siguiente.h1, 42))} →</a>')
    nav = f'<nav class="siblings">{"".join(hermanas)}</nav>' if hermanas else ""

    return f"""{senderos}
  <article>
    <h1>{esc(norma.h1)}</h1>
    <p class="lead">{esc(norma.titulo or norma.etiqueta)}</p>
    <p class="meta">{esc(norma.etiqueta)}{' · ' + esc(fecha_larga(norma.fecha)) if norma.fecha else ''} · {esc(HCD_NOMBRE)}</p>
    {cuerpo}
    {fuente}
  </article>
  {nav}
  {cta('¿Tenés una duda sobre esta norma?', 'El asistente la responde con el texto oficial a la vista.')}"""


def jsonld_norma(norma: Norma, senderos_items: Sequence[Tuple[str, Optional[str]]]) -> List[Dict]:
    legislation = {
        "@context": "https://schema.org",
        "@type": "Legislation",
        "name": norma.h1 + (f" — {norma.titulo}" if norma.titulo else ""),
        "url": norma.url,
        "legislationIdentifier": norma.numero or norma.slug,
        "legislationType": norma.etiqueta[:-1].lower(),
        "legislationJurisdiction": "San Carlos de Bolívar, Buenos Aires, Argentina",
        "inLanguage": "es-AR",
        "publisher": {"@type": "Organization", "name": HCD_NOMBRE},
        "isPartOf": {"@type": "CreativeWork", "name": f"{norma.etiqueta} del HCD de Bolívar",
                     "url": SITE + f"/normas/{norma.seccion}/"},
    }
    if norma.fecha:
        legislation["datePublished"] = norma.fecha
    if norma.url_oficial:
        legislation["sameAs"] = [norma.url_oficial]
    return [legislation, jsonld_migas(senderos_items)]


def jsonld_migas(items: Sequence[Tuple[str, Optional[str]]]) -> Dict:
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": nombre,
             **({"item": SITE + url} if url else {})}
            for i, (nombre, url) in enumerate(items)
        ],
    }


def generar_normas(normas: List[Norma], escritor: Escritor) -> None:
    por_seccion: Dict[str, List[Norma]] = {}
    for norma in normas:
        por_seccion.setdefault(norma.seccion, []).append(norma)

    total_indexables = 0

    # --- páginas de norma -------------------------------------------------
    for seccion, lista in por_seccion.items():
        etiqueta = SECCIONES.get(seccion, (seccion, "norma"))[0]
        for anio in sorted({n.anio for n in lista}, reverse=True):
            del_anio = sorted([n for n in lista if n.anio == anio],
                              key=lambda n: n.orden())
            for i, norma in enumerate(del_anio):
                previa = del_anio[i - 1] if i > 0 else None
                siguiente = del_anio[i + 1] if i + 1 < len(del_anio) else None
                items = [("Inicio", "/"), ("Normas del HCD", "/normas/"),
                         (etiqueta, f"/normas/{seccion}/"),
                         (anio, f"/normas/{seccion}/{anio}/"),
                         (norma.h1, None)]
                escritor.write(
                    norma.path,
                    page(title=norma.title_tag(),
                         description=norma.meta_descripcion(),
                         canonical=norma.url,
                         body=norma_body(norma, breadcrumbs(items), previa, siguiente),
                         jsonld=jsonld_norma(norma, items),
                         indexable=not norma.sin_texto),
                    lastmod=norma.fecha or TODAY,
                    sitemap=not norma.sin_texto)
                if not norma.sin_texto:
                    total_indexables += 1

    # --- índice por año ---------------------------------------------------
    for seccion, lista in por_seccion.items():
        etiqueta = SECCIONES.get(seccion, (seccion, "norma"))[0]
        for anio in sorted({n.anio for n in lista}, reverse=True):
            del_anio = sorted([n for n in lista if n.anio == anio],
                              key=lambda n: n.orden())
            filas = "\n".join(
                f'      <li><a href="{esc(n.path)}"><span class="num">{esc(n.numero or n.h1)}</span>'
                f'<span class="t">{esc(clip(n.titulo or n.etiqueta, 110))}</span>'
                f'<span class="d">{esc(n.fecha or "")}</span></a></li>'
                for n in del_anio)
            items = [("Inicio", "/"), ("Normas del HCD", "/normas/"),
                     (etiqueta, f"/normas/{seccion}/"), (anio, None)]
            body = f"""{breadcrumbs(items)}
  <h1>{esc(etiqueta)} de {esc(anio)}</h1>
  <p class="lead">{len(del_anio)} {'norma' if len(del_anio) == 1 else 'normas'} del {esc(HCD_NOMBRE)} con fecha en {esc(anio)}. Cada una tiene su texto completo y el enlace al documento original.</p>
  <ul class="norm-list">
{filas}
  </ul>
  {cta(f'¿Buscás una norma de {anio} que no está en la lista?', 'El asistente busca en el archivo completo y en el Boletín Oficial.')}"""
            escritor.write(
                f"/normas/{seccion}/{anio}/",
                page(title=clip(f"{etiqueta} de {anio} · Bolívar", 60),
                     description=clip(f"Listado de {len(del_anio)} {etiqueta.lower()} del HCD de San Carlos de Bolívar con fecha en {anio}, con texto completo y enlace al documento oficial.", 155),
                     canonical=f"{SITE}/normas/{seccion}/{anio}/",
                     body=body,
                     jsonld=[jsonld_migas(items)]))

    # --- índice por sección ----------------------------------------------
    for seccion, lista in por_seccion.items():
        etiqueta = SECCIONES.get(seccion, (seccion, "norma"))[0]
        anios: Dict[str, int] = {}
        for n in lista:
            anios[n.anio] = anios.get(n.anio, 0) + 1
        anios_reales = sorted(a for a in anios if a.isdigit())
        rango_seccion = (f", desde {anios_reales[0]} hasta {anios_reales[-1]}"
                         if anios_reales else "")
        tarjetas = "\n".join(
            f'      <li><a href="/normas/{esc(seccion)}/{esc(a)}/"><span class="num">{esc(a)}</span>'
            f'<span class="t">{c} {"norma" if c == 1 else "normas"}</span></a></li>'
            for a, c in sorted(anios.items(), reverse=True))
        ultimas = sorted(lista, key=lambda n: n.orden(), reverse=True)[:12]
        filas = "\n".join(
            f'      <li><a href="{esc(n.path)}"><span class="num">{esc(n.numero or n.h1)}</span>'
            f'<span class="t">{esc(clip(n.titulo or n.etiqueta, 110))}</span>'
            f'<span class="d">{esc(n.fecha or "")}</span></a></li>' for n in ultimas)
        items = [("Inicio", "/"), ("Normas del HCD", "/normas/"), (etiqueta, None)]
        body = f"""{breadcrumbs(items)}
  <h1>{esc(etiqueta)} del Concejo Deliberante de Bolívar</h1>
  <p class="lead">{len(lista)} {etiqueta.lower()} del {esc(HCD_NOMBRE)} cargadas en el archivo{rango_seccion}. Elegí un año para ver el listado completo.</p>
  <h2>Años</h2>
  <ul class="norm-list">
{tarjetas}
  </ul>
  <h2 style="margin-top:34px">Últimas publicadas</h2>
  <ul class="norm-list">
{filas}
  </ul>
  {cta('¿No encontrás la norma que buscás?', 'Escribile al asistente el número o el tema: busca en todo el archivo y en el Boletín Oficial.')}"""
        escritor.write(
            f"/normas/{seccion}/",
            page(title=clip(f"{etiqueta} del HCD de Bolívar · archivo completo", 60),
                 description=clip(f"{len(lista)} {etiqueta.lower()} del Honorable Concejo Deliberante de San Carlos de Bolívar"
                                  + (f" desde {anios_reales[0]} hasta {anios_reales[-1]}" if anios_reales else "")
                                  + ", con texto completo y enlace al documento oficial.", 155),
                 canonical=f"{SITE}/normas/{seccion}/",
                 body=body,
                 jsonld=[jsonld_migas(items)]))

    # --- hub --------------------------------------------------------------
    tarjetas = []
    for seccion in ORDEN_SECCIONES:
        lista = por_seccion.get(seccion)
        if not lista:
            continue
        etiqueta = SECCIONES[seccion][0]
        anios_seccion = sorted(n.anio for n in lista if n.anio.isdigit())
        rango = f" · {anios_seccion[0]}–{anios_seccion[-1]}" if anios_seccion else ""
        tarjetas.append(f"""      <article class="card">
        <h3>{esc(etiqueta)}</h3>
        <p class="count">{len(lista)} {'norma' if len(lista) == 1 else 'normas'}{rango}</p>
        <p>{esc(DESCRIPCION_SECCION.get(seccion, ''))}</p>
        <a href="/normas/{esc(seccion)}/">Ver el listado</a>
      </article>""")
    ultimas = sorted(normas, key=lambda n: n.orden(), reverse=True)[:15]
    filas = "\n".join(
        f'      <li><a href="{esc(n.path)}"><span class="num">{esc(n.numero or n.h1)}</span>'
        f'<span class="t">{esc(clip(n.titulo or n.etiqueta, 110))}</span>'
        f'<span class="d">{esc(n.fecha or "")}</span></a></li>' for n in ultimas)
    con_texto = sum(1 for n in normas if not n.sin_texto)
    anios = sorted(n.anio for n in normas if n.anio.isdigit())
    items = [("Inicio", "/"), ("Normas del HCD", None)]
    body = f"""{breadcrumbs(items)}
  <h1>Normas del Honorable Concejo Deliberante de Bolívar</h1>
  <p class="lead">El archivo completo del Concejo Deliberante de San Carlos de Bolívar: {len(normas)} normas —ordenanzas, decretos, resoluciones y comunicaciones— desde {anios[0]} hasta {anios[-1]}. {con_texto} están digitalizadas con su texto completo y todas enlazan al documento original.</p>
  <div class="cards">
{chr(10).join(tarjetas)}
  </div>
  <h2 style="margin-top:40px">Últimas normas publicadas</h2>
  <ul class="norm-list">
{filas}
  </ul>
  {cta('¿Buscás una ordenanza por su número?', 'Escribile el número al asistente y te responde con el texto, la fecha y el enlace oficial.')}"""
    escritor.write(
        "/normas/",
        page(title=clip("Normas y ordenanzas del HCD de Bolívar · archivo completo", 62),
             description=clip(f"Archivo completo de normas del Honorable Concejo Deliberante de San Carlos de Bolívar: {len(normas)} ordenanzas, decretos, resoluciones y comunicaciones desde {min(n.anio for n in normas)}, con texto completo.", 155),
             canonical=f"{SITE}/normas/",
             body=body,
             jsonld=[jsonld_migas(items)]))
    print(f"normas: {len(normas)} páginas de norma ({total_indexables} indexables) + índices")


DESCRIPCION_SECCION = {
    "ordenanzas": "Las ordenanzas sancionadas por el Concejo Deliberante: el cuerpo normativo principal del municipio (tasas, tránsito, habilitaciones, obras, uso del espacio público).",
    "decretos": "Los decretos del Departamento Ejecutivo Municipal publicados en el archivo del Concejo Deliberante.",
    "resoluciones": "Las resoluciones del Concejo Deliberante sobre temas administrativos y de funcionamiento interno.",
    "comunicaciones": "Las comunicaciones aprobadas por el Concejo Deliberante.",
    "ordenanzas-de-interes": "Ordenanzas declaradas de interés municipal por el Concejo Deliberante.",
}


# ---------------------------------------------------------------------------
# Trámites (Guía de Trámites del sitio del municipio)
# ---------------------------------------------------------------------------

def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept-Language": "es-AR,es;q=0.9",
    })
    with urllib.request.urlopen(req, timeout=25) as resp:
        return resp.read().decode("utf-8", "replace")


def texto_plano(markup: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", markup))).strip()


def parse_guia(markup: str) -> List[Dict[str, str]]:
    """Áreas y trámites del listado de /guia-de-tramites (ver estructura real:
    <div class="cati"><h2>área</h2><nav class="navio"><li><a href="slug">
    <h3>nombre</h3><p>bajada</p>)."""
    inicio = markup.find('<section id="tramites">')
    if inicio == -1:
        return []
    tramites = []
    for bloque in re.split(r'<div class="cati">', markup[inicio:])[1:]:
        area_m = re.search(r"<h2[^>]*>(.*?)</h2>", bloque, re.S)
        if not area_m:
            continue
        area = re.sub(r"\(\d+\)", "", texto_plano(area_m.group(1))).strip()
        for item in re.split(r"<li>", bloque)[1:]:
            link = re.search(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', item, re.S)
            if not link:
                continue
            nombre_m = re.search(r"<h3[^>]*>(.*?)</h3>", link.group(2), re.S)
            if not nombre_m:
                continue
            bajada_m = re.search(r"<p[^>]*>(.*?)</p>", link.group(2), re.S)
            tramites.append({
                "area": area,
                "slug": link.group(1).strip().strip("/").split("/")[-1],
                "nombre": texto_plano(nombre_m.group(1)),
                "bajada": texto_plano(bajada_m.group(1)) if bajada_m else "",
            })
    return tramites


def parse_tramite(markup: str) -> Dict:
    """Bloques de una página de trámite: el h1 y cada <h2> con su cuerpo.

    El cuerpo de cada bloque trae párrafos sueltos, listas (<li>) y —cuando el
    trámite adjunta formularios— enlaces a los archivos del municipio. Los
    <br> dentro de un párrafo son renglones de una lista (documentación a
    presentar), así que se separan como ítems en vez de quedar en un bloque
    denso de texto.
    """
    inicio = markup.find('<section id="tramite">')
    fin = markup.find('<div class="datafooter', inicio)
    if inicio == -1:
        return {}
    seg = markup[inicio:fin if fin != -1 else len(markup)]

    titulo_m = re.search(r"<h1[^>]*>(.*?)</h1>", seg, re.S)
    if not titulo_m:
        return {}

    bloques = []
    partes = re.split(r"<h2[^>]*>(.*?)</h2>", seg, flags=re.S)
    for titulo, cuerpo in zip(partes[1::2], partes[2::2]):
        encabezado = texto_plano(titulo)
        # «IMPORTANTE» es un rótulo del municipio: el bloque lleva el requisito
        # legal y la documentación a presentar, así que se rotula como tal.
        if re.fullmatch(r"(?i)importante", encabezado):
            encabezado = "Requisitos y documentación"

        parrafos: List[str] = []
        items: List[str] = []
        sin_listas = re.sub(r"<li[^>]*>.*?</li>", " ", cuerpo, flags=re.S)
        for parrafo in re.findall(r"<p[^>]*>(.*?)</p>", sin_listas, re.S):
            lineas = [l for l in
                      (texto_plano(trozo) for trozo in re.split(r"<br\s*/?>", parrafo))
                      if l]
            if len(lineas) > 1:
                items.extend(re.sub(r"^\*+\s*", "", l) for l in lineas)
            elif lineas:
                parrafos.append(lineas[0])
        for li in re.findall(r"<li[^>]*>(.*?)</li>", cuerpo, re.S):
            texto_li = texto_plano(li)
            if texto_li:
                items.append(texto_li)

        archivos = [
            (texto_plano(m.group(2)) or m.group(1).rsplit("/", 1)[-1],
             MUNICIPIO + m.group(1) if m.group(1).startswith("/") else m.group(1))
            for m in re.finditer(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', cuerpo, re.S)
        ]
        archivos = [a for a in archivos if a[1].lower().split("?")[0].endswith((".jpg", ".jpeg", ".png", ".pdf"))]
        # Si el bloque es el listado de formularios, los <li> repiten el nombre
        # de cada archivo: se muestran como botones, no como lista.
        if archivos:
            items = []

        if not parrafos and not items and not archivos:
            continue
        bloques.append({"titulo": encabezado, "parrafos": parrafos,
                        "items": items, "archivos": archivos})
    return {"nombre": texto_plano(titulo_m.group(1)), "bloques": bloques}


def render_bloque(bloque: Dict) -> str:
    """Un bloque de la guía como tarjeta: título, párrafos, lista y formularios."""
    partes = []
    if bloque["titulo"]:
        partes.append(f"<h2>{esc(bloque['titulo'])}</h2>")
    partes += [f"<p>{esc(p)}</p>" for p in bloque["parrafos"]]
    if bloque["items"]:
        partes.append("<ul>" + "".join(f"<li>{esc(i)}</li>" for i in bloque["items"]) + "</ul>")
    if bloque["archivos"]:
        partes.append('<div class="forms">' + "".join(
            f'<a href="{esc(u)}" target="_blank" rel="noopener nofollow">{esc(n)}</a>'
            for n, u in bloque["archivos"]) + "</div>")
    cuerpo = "\n      ".join(partes)
    return f'    <section class="req">\n      {cuerpo}\n    </section>'


def generar_tramites(escritor: Escritor, limite: Optional[int] = None) -> None:
    try:
        guia = parse_guia(fetch(GUIA_URL))
    except (urllib.error.URLError, TimeoutError) as exc:
        print(f"trámites: no se pudo leer {GUIA_URL} ({exc}) — se saltean", file=sys.stderr)
        return
    if limite:
        guia = guia[:limite]

    trámites = []
    for item in guia:
        try:
            detalle = parse_tramite(fetch(f"{GUIA_URL}/{item['slug']}"))
        except (urllib.error.URLError, TimeoutError) as exc:
            print(f"trámites: {item['slug']} no se pudo leer ({exc}) — se saltea", file=sys.stderr)
            continue
        if detalle:
            trámites.append({**item, **detalle})
    if not trámites:
        return

    for t in trámites:
        items = [("Inicio", "/"), ("Trámites", "/tramites/"), (t["nombre"], None)]
        requisitos = next((b for b in t["bloques"] if b["items"]), None) or \
            next((b for b in t["bloques"] if b["parrafos"]), None)
        cuerpo = "\n".join(render_bloque(b) for b in t["bloques"])
        respuesta = clip(" ".join((requisitos["parrafos"] + requisitos["items"])
                                  if requisitos else [t["bajada"]]), 700)
        faq = [{
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [{
                "@type": "Question",
                "name": f"¿Qué se necesita para {t['nombre'][:60]} en Bolívar?",
                "acceptedAnswer": {"@type": "Answer", "text": respuesta},
            }],
        }, jsonld_migas(items)]

        body = f"""{breadcrumbs(items)}
      <h1>{esc(t['nombre'])}</h1>
      <p class="meta">Área: {esc(t['area'])} · {esc(MUNICIPIO_NOMBRE)}</p>
      <p class="lead">Información oficial del trámite, tal como la publica la Guía de Trámites del municipio. Si te queda una duda, preguntale al asistente.</p>
    {cuerpo}
      <p class="source">Fuente oficial: <a href="{esc(GUIA_URL + '/' + t['slug'])}" target="_blank" rel="noopener nofollow">Guía de Trámites — {esc(MUNICIPIO_NOMBRE)}</a>. Verificá siempre los requisitos en el sitio del municipio antes de iniciar el trámite.</p>
      <h2 style="margin-top:34px">Preguntas frecuentes</h2>
      <div class="faq">
        <details open>
          <summary>¿Qué se necesita para {esc(t['nombre'][:60])} en Bolívar?</summary>
          <p>{esc(respuesta)}</p>
        </details>
      </div>
      {cta('¿Te queda alguna duda con este trámite?', 'El asistente responde con la información oficial del municipio, a cualquier hora.')}"""
        escritor.write(
            f"/tramites/{t['slug']}/",
            page(title=clip(f"{t['nombre']} en Bolívar · requisitos y dónde se hace", 62),
                 description=clip(f"{t['nombre']}: requisitos, documentación y dónde se realiza en San Carlos de Bolívar. Información oficial de la Guía de Trámites del municipio.", 155),
                 canonical=f"{SITE}/tramites/{t['slug']}/",
                 body=body,
                 jsonld=faq))

    areas: Dict[str, List[Dict]] = {}
    for t in trámites:
        areas.setdefault(t["area"], []).append(t)
    tarjetas = "\n".join(
        f"""    <article class="card">
      <h3>{esc(t['nombre'])}</h3>
      <p>{esc(clip(t['bajada'], 145))}</p>
      <a href="/tramites/{esc(t['slug'])}/">Ver requisitos y dónde se hace</a>
    </article>""" for t in trámites)
    items = [("Inicio", "/"), ("Trámites", None)]
    body = f"""{breadcrumbs(items)}
  <h1>Trámites municipales de Bolívar</h1>
  <p class="lead">Los trámites que publica la Guía de Trámites del {esc(MUNICIPIO_NOMBRE)}, con la documentación que pide cada uno y dónde se realiza. Si no encontrás el tuyo, preguntale al asistente: responde con la información oficial a cualquier hora.</p>
  <div class="cards">
{tarjetas}
  </div>
  {cta('¿No encontrás tu trámite?', 'Escribile al asistente qué necesitás hacer y te dice qué documentación presentar y en qué área.')}"""
    escritor.write(
        "/tramites/",
        page(title=clip("Trámites municipales de Bolívar · requisitos y dónde se hacen", 62),
             description=clip(f"Guía de trámites del {MUNICIPIO_NOMBRE}: documentación, requisitos y dónde se realiza cada trámite. Consultá gratis por chat.", 155),
             canonical=f"{SITE}/tramites/",
             body=body,
             jsonld=[jsonld_migas(items)]))
    print(f"trámites: {len(trámites)} páginas + hub ({len(areas)} áreas)")


# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--corpus", type=Path,
                    help="JSONL del HCD (scripts/fetch_bolivar_normas.py)")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT,
                    help=f"directorio de la landing (default: {DEFAULT_OUT})")
    ap.add_argument("--only", choices=["normas", "tramites"],
                    help="generar sólo una parte (tramites no necesita corpus)")
    ap.add_argument("--limit-tramites", type=int, default=None,
                    help="sólo los primeros N trámites (para probar)")
    args = ap.parse_args()

    if not args.out.is_dir():
        print(f"no existe el directorio de salida: {args.out}", file=sys.stderr)
        return 1
    escritor = Escritor(args.out)

    if args.only != "tramites":
        if not args.corpus:
            print("falta --corpus (o usá --only tramites)", file=sys.stderr)
            return 1
        if not args.corpus.is_file():
            print(f"no existe el corpus: {args.corpus}", file=sys.stderr)
            return 1
        generar_normas(cargar_normas(args.corpus), escritor)

    if args.only != "normas":
        generar_tramites(escritor, args.limit_tramites)

    escritor.sitemap()
    return 0


if __name__ == "__main__":
    sys.exit(main())
