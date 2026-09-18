#!/usr/bin/env python3
"""
Genera el documento del árbol de decisión de iUS (Markdown + HTML entregable)
a partir de `docs/ius_legal_config.json`, que es la fuente de verdad del prompt
del agente.

Por qué un generador y no dos documentos a mano: el árbol, las 32 reglas de
semáforo, los plazos en días naturales y la matriz de documentación ya viven en
el JSON que se le inyecta al LLM. Una copia manual en Markdown garantiza
divergencia (el repo ya tuvo una: decía "25 reglas" cuando había 27). El JSON
manda; el .md y el .html se regeneran.

El HTML es un único archivo autocontenido, tema claro, con el diagrama Mermaid
(CDN) y botones para descargarlo como SVG/PNG o imprimirlo. Las tablas del HTML
se emiten desde el mismo modelo que el Markdown: no se parsea el .md.

Uso:
  python3 scripts/build_ius_arbol_decision.py
  python3 scripts/build_ius_arbol_decision.py --config RUTA --md-out RUTA --html-out RUTA
"""

import argparse
import html
import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = REPO_ROOT / "docs" / "ius_legal_config.json"
DEFAULT_MD = REPO_ROOT / "docs" / "IUS_ARBOL_DECISION.md"
DEFAULT_HTML = REPO_ROOT / "docs" / "IUS_ARBOL_DECISION.html"

# Paleta del documento de origen (/home/mmanto/tmp/ius/index.html), que este
# artefacto reemplaza: se conservan los mismos colores por semáforo.
COLORES = {
    "verde": ("#1e7d1e", "#e6f9e6", "#b6e6b6"),
    "amarillo": ("#a97f00", "#fff6d9", "#f0dca0"),
    "rojo": ("#c0392b", "#ffe4e1", "#f3bcb4"),
}
ROTULO_COLOR = {"verde": "🟢 VERDE", "amarillo": "🟡 AMARILLO", "rojo": "🔴 ROJO"}


# ── Modelo ───────────────────────────────────────────────────────────────────

def build_model(config: dict) -> dict:
    """Aplana el JSON canónico en la estructura que consumen los renderers."""
    arbol = config.get("arbol_decision") or {}
    plazos = config.get("plazos_legales") or {}
    conf = config.get("config") or {}
    prioridad = config.get("priority") or {}
    pasos = list(arbol.get("pasos") or [])
    terminales = list(arbol.get("terminales") or [])

    terminal_por_id = {t["id"]: t for t in terminales if isinstance(t, dict) and t.get("id")}
    paso_por_id = {p["id"]: p for p in pasos if isinstance(p, dict) and p.get("id")}

    return {
        "pasos": pasos,
        "terminales": terminales,
        "terminal_por_id": terminal_por_id,
        "paso_por_id": paso_por_id,
        "plazos": plazos,
        "matriz": config.get("matriz_documentacion") or {},
        "senales": config.get("senales_decision") or {},
        "intencion": config.get("intencion_pago") or {},
        "descarte": config.get("descarte_inmediato") or {},
        "acciones": config.get("acciones_por_color") or {},
        "reglas": list(prioridad.get("reglas") or []),
        "umbrales": {u["nombre"]: u for u in (prioridad.get("umbrales") or []) if isinstance(u, dict) and u.get("nombre")},
        "instruccion_de_aplicacion": list(prioridad.get("instruccion_de_aplicacion") or []),
        "state_vars": config.get("state_vars") or {},
        "restricciones": config.get("forbidden") or {},
        "precio": conf.get("precio_asesoria_mxn"),
        "moneda": conf.get("moneda") or "MXN",
    }


def _flow_id(raw: str) -> str:
    return re.sub(r"[^A-Za-z0-9_]", "_", str(raw))


def _etiqueta_terminal(terminal: dict) -> str:
    return f"{ROTULO_COLOR.get(terminal.get('color'), terminal.get('color', ''))} · {terminal.get('etiqueta', '')}"


def _anotar_bandas(valor: str, umbrales: dict) -> str:
    """Anota un nombre de banda con su rango de días (ver priority.umbrales)."""
    umbral = umbrales.get(valor)
    if not umbral:
        return str(valor)
    texto = umbral.get("texto")
    if not texto:
        desde, hasta = umbral.get("min_dias"), umbral.get("max_dias")
        texto = f"{desde}+ días" if hasta is None else f"{desde}-{hasta} días"
    return f"{valor} ({texto})"


def _filtros(regla: dict, umbrales: dict) -> str:
    """Condiciones de una regla, en el orden en que las declara el JSON."""
    partes = []
    for campo, valor in regla.items():
        if campo in ("color", "nombre", "texto", "pendiente_validacion_legal", "precedencia"):
            continue
        if campo == "condicion":
            partes.append(f"condición: {valor}")
            continue
        if campo == "evaluar":
            partes.append(f"evaluar: {valor}")
            continue
        valores = valor if isinstance(valor, list) else [valor]
        textos = []
        for v in valores:
            if v is None:
                textos.append("sin dato")
            elif campo == "tiempo_transcurrido" and v != "cualquiera":
                textos.append(_anotar_bandas(v, umbrales))
            else:
                textos.append(str(v))
        partes.append(f"{campo} = {' | '.join(textos)}")
    return "; ".join(partes) if partes else "—"


def _salida_paso(paso: dict, model: dict) -> str:
    """A dónde lleva el paso: al siguiente paso o a un terminal."""
    rama_no = paso.get("no")
    if isinstance(rama_no, dict):
        destino = model["terminal_por_id"].get(rama_no.get("goto"))
        etiqueta = _etiqueta_terminal(destino) if destino else rama_no.get("goto")
        return f"NO → {etiqueta} ({rama_no.get('motivo', '')})"
    siguiente = paso.get("siguiente")
    if not siguiente:
        return "— (salida del árbol)"
    return f"→ {siguiente}"


def _datos_paso(paso: dict, model: dict) -> str:
    """Variables del paso, anotadas con los valores admitidos en state_vars."""
    partes = []
    for dato in paso.get("datos") or []:
        admitidos = model["state_vars"].get(dato)
        partes.append(f"{dato} ({admitidos})" if isinstance(admitidos, str) else str(dato))
    return "; ".join(partes) if partes else "—"


# ── Diagrama Mermaid ─────────────────────────────────────────────────────────

def mermaid_diagram(model: dict) -> str:
    """`flowchart TD` de los 9 pasos y sus 5 salidas terminales."""
    lineas = ["flowchart TD", ""]
    ids = {paso["id"]: _flow_id(paso["id"]) for paso in model["pasos"]}
    term_ids = {}
    for terminal in model["terminales"]:
        tid = _flow_id(terminal["id"])
        while tid in ids.values():  # evita colisión con el id de un paso
            tid += "_salida"
        term_ids[terminal["id"]] = tid

    for terminal in model["terminales"]:
        color = terminal.get("color")
        clase = color if color in COLORES else "pregunta"
        lineas.append(f'  {term_ids[terminal["id"]]}["{_etiqueta_terminal(terminal)}"]:::{clase}')

    for paso in model["pasos"]:
        etiqueta = f'{paso.get("numero", "")}. {paso.get("pregunta", "")}'.strip()
        lineas.append(f'  {ids[paso["id"]]}{{"{etiqueta}"}}:::pregunta')

    lineas.append("")
    for paso in model["pasos"]:
        origen = ids[paso["id"]]
        if paso.get("siguiente") in ids:
            lineas.append(f"  {origen} --> {ids[paso['siguiente']]}")
        rama_no = paso.get("no")
        if isinstance(rama_no, dict) and rama_no.get("goto") in term_ids:
            lineas.append(f'  {origen} -- "NO" --> {term_ids[rama_no["goto"]]}')

    acciones = model["acciones"]
    for color, terminal in (("verde", "verde"), ("amarillo", "amarillo"), ("rojo", "rojo")):
        if color in term_ids and model["acciones"].get(color, {}).get("accion"):
            texto = acciones[color]["accion"]
            lineas.append(f'  {term_ids[terminal]} -.-> ACC_{color}["{texto}"]:::{color}')

    lineas += [
        "",
        "  classDef pregunta fill:#e9f0ff,stroke:#2b5fb0,stroke-width:2px,color:#12305c;",
        "  classDef verde    fill:#e6f9e6,stroke:#1e7d1e,stroke-width:2px,color:#0d3d0d,font-weight:bold;",
        "  classDef amarillo fill:#fff6d9,stroke:#c9a227,stroke-width:2px,color:#5c4700,font-weight:bold;",
        "  classDef rojo     fill:#ffe4e1,stroke:#c0392b,stroke-width:2px,color:#5c1010,font-weight:bold;",
    ]
    return "\n".join(lineas)


# ── Markdown ─────────────────────────────────────────────────────────────────

def _md_celda(valor) -> str:
    texto = "—" if valor is None or valor == "" else str(valor)
    return texto.replace("|", "\\|").replace("\n", " ").strip()


def _md_tabla(encabezados, filas) -> str:
    out = ["| " + " | ".join(encabezados) + " |", "|" + "|".join(["---"] * len(encabezados)) + "|"]
    for fila in filas:
        out.append("| " + " | ".join(_md_celda(c) for c in fila) + " |")
    return "\n".join(out)


def _md_plazos(model: dict) -> list:
    plazos = model["plazos"]
    filas = []
    for clave, nombre in (("imss", "IMSS (sector privado)"), ("issste", "ISSSTE (sector público)")):
        banda = plazos.get(clave) or {}
        filas.append([
            nombre,
            banda.get("ley"),
            f"{banda.get('total_dias')} días naturales",
            f"0-{banda.get('favorable_hasta_dia')}",
            f"{int(banda.get('favorable_hasta_dia', 0)) + 1}-{banda.get('limite_hasta_dia')}",
            f"{banda.get('prescripcion_desde_dia')}+",
        ])
    return filas


def to_markdown(model: dict) -> str:
    diagrama = mermaid_diagram(model)
    partes = [
        "# Árbol de Decisión — Semáforo Legal Laboral (iUS)",
        "",
        "Generado por `scripts/build_ius_arbol_decision.py` desde `docs/ius_legal_config.json`. "
        "No editar a mano: regenerá el documento con el script.",
        "",
        "## Leyenda",
        "",
        "|Nodo|Significado|",
        "|---|---|",
        "|Entrada|Datos que ya trae la conversación (state_vars)|",
        "|Pregunta|Paso de evaluación del árbol|",
        "|🟢 Verde|Asunto sólido: en tiempo, con pruebas y con disposición a pagar|",
        "|🟡 Amarillo|Zona de riesgo: educar y reducir fricción|",
        "|🔴 Rojo|Descartado: cierre empático, sin insistir en la venta|",
        "",
        "## Árbol",
        "",
        "```mermaid",
        diagrama,
        "```",
        "",
        "## Pasos",
        "",
        _md_tabla(
            ["Nº", "Pregunta", "Criterio", "Datos", "Nodos del flow", "Resultado"],
            [
                [
                    paso.get("numero"),
                    paso.get("pregunta"),
                    paso.get("criterio"),
                    _datos_paso(paso, model),
                    ", ".join(paso.get("nodos_flow") or []) or "—",
                    _salida_paso(paso, model),
                ]
                for paso in model["pasos"]
            ],
        ),
        "",
        "## Plazos legales",
        "",
        f"Conteo: {_md_celda(model['plazos'].get('conteo'))}.",
        "",
        _md_tabla(
            ["Institución", "Ley", "Plazo total", "Favorable", "Límite", "Prescripción"],
            _md_plazos(model),
        ),
        "",
        f"**Interrupción del plazo:** {_md_celda(model['plazos'].get('interrupcion'))}",
        "",
        f"**Otros plazos:** "
        + "; ".join(f"{k} = {v}" for k, v in (model["plazos"].get("otros") or {}).items()),
        "",
        f"**Instrucción de cómputo:** {_md_celda(model['plazos'].get('instruccion'))}",
        "",
        "## Matriz de documentación",
        "",
        _md_celda(model["matriz"].get("instruccion")),
        "",
        _md_tabla(
            ["Bloque", "Color", "Criterio"],
            [
                [b.get("etiqueta"), ROTULO_COLOR.get(b.get("color"), b.get("color")), b.get("criterio")]
                for b in (model["matriz"].get("bloques") or [])
            ],
        ),
        "",
        "## Señales de decisión",
        "",
        _md_celda(model["senales"].get("instruccion")),
        "",
    ]
    for clave, titulo in (("positivas", "Señales positivas"), ("limite", "Señales límite"), ("negativas", "Señales negativas")):
        partes += [
            f"**{titulo}**",
            "",
            _md_tabla(
                ["Señal", "Condición"],
                [[s.get("texto"), f"`{s.get('condicion')}`"] for s in (model["senales"].get(clave) or [])],
            ),
            "",
        ]

    intencion = model["intencion"]
    partes += [
        "## Intención de pago",
        "",
        f"{_md_celda(intencion.get('instruccion'))} "
        f"Precio de referencia: **${model['precio']:,} {model['moneda']}** "
        f"(`{_md_celda(intencion.get('precio_ref'))}`).",
        "",
        _md_tabla(
            ["Nivel", "Señales", "Acción"],
            [
                [nivel, "; ".join((intencion.get(nivel) or {}).get("señales") or []), (intencion.get(nivel) or {}).get("accion")]
                for nivel in ("alta", "duda", "rechazo")
            ],
        ),
        "",
        "## Semáforo final y acciones",
        "",
        _md_celda(model["acciones"].get("instruccion")),
        "",
        _md_tabla(
            ["Color", "Acción de cierre", "Nodo del flow"],
            [
                [ROTULO_COLOR.get(color, color), (model["acciones"].get(color) or {}).get("accion"), (model["acciones"].get(color) or {}).get("nodo_flow")]
                for color in ("verde", "amarillo", "rojo")
            ],
        ),
        "",
        "## Descarte inmediato",
        "",
        _md_celda(model["descarte"].get("instruccion")),
        "",
        _md_tabla(
            ["Criterio", "Regla"],
            [[c.get("texto"), f"`{c.get('regla')}`"] for c in (model["descarte"].get("criterios") or [])],
        ),
        "",
        "## Reglas de calificación",
        "",
        "Se recorren en orden ascendente de `precedencia`: la primera cuyos filtros y condición se cumplan "
        "define el color. El orden resuelve la precedencia entre reglas que empatan.",
        "",
        _md_tabla(
            ["#", "Regla", "Color", "Condiciones", "Pendiente de validación legal", "Texto"],
            [
                [
                    regla.get("precedencia"),
                    f"`{regla.get('nombre')}`",
                    ROTULO_COLOR.get(regla.get("color"), regla.get("color")),
                    _filtros(regla, model["umbrales"]),
                    "sí" if regla.get("pendiente_validacion_legal") else "—",
                    regla.get("texto"),
                ]
                for regla in model["reglas"]
            ],
        ),
        "",
        "## Restricciones de la IA",
        "",
    ]
    restricciones = model["restricciones"]
    for clave, titulo in (
        ("frase_base_obligatoria", "Frase base obligatoria"),
        ("actions", "Acciones prohibidas"),
        ("phrases", "Frases prohibidas"),
        ("prohibido_asegurar", "Prohibido asegurar"),
        ("prohibido_montos", "Prohibido mencionar montos"),
        ("prohibido_modelos_de_pago", "Prohibido comunicar modelos de pago"),
        ("use_instead", "En su lugar"),
    ):
        valor = restricciones.get(clave)
        if not valor:
            continue
        if isinstance(valor, str):
            partes += [f"**{titulo}:** {valor}", ""]
        else:
            partes += [f"**{titulo}:**", ""] + [f"- {item}" for item in valor] + [""]
    return "\n".join(partes).rstrip() + "\n"


# ── HTML ─────────────────────────────────────────────────────────────────────

CSS = """
  :root {
    --bg: #f4f6fb;
    --card: #ffffff;
    --ink: #0f172a;
    --muted: #5b6675;
    --line: #e3e8f0;
    --verde: #1e7d1e;  --verde-bg: #e6f9e6;
    --amarillo: #a97f00; --amarillo-bg: #fff6d9;
    --rojo: #c0392b;   --rojo-bg: #ffe4e1;
    --azul: #2b5fb0;   --azul-bg: #e9f0ff;
    --morado: #6b4fbb; --morado-bg: #efe9ff;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0 0 60px;
    background: radial-gradient(1200px 600px at 50% -200px, #e8efff 0%, var(--bg) 60%);
    font-family: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: var(--ink);
    -webkit-font-smoothing: antialiased;
  }
  header, main, footer { max-width: 1400px; margin: 0 auto; padding: 0 24px; }
  header { padding-top: 38px; padding-bottom: 12px; }
  header h1 { margin: 0 0 8px; font-size: 26px; letter-spacing: -0.02em; }
  header p { margin: 0; color: var(--muted); font-size: 15px; max-width: 980px; line-height: 1.55; }
  .badge {
    display: inline-block; background: var(--azul-bg); color: var(--azul);
    border: 1px solid #c7d8f7; border-radius: 999px; font-size: 12px; font-weight: 600;
    padding: 4px 12px; margin-bottom: 14px; letter-spacing: 0.04em; text-transform: uppercase;
  }
  .card {
    background: var(--card); border: 1px solid var(--line); border-radius: 16px;
    padding: 22px 24px; box-shadow: 0 8px 28px rgba(15, 23, 42, 0.05); margin-bottom: 22px;
  }
  .card h2 { margin: 0 0 14px; font-size: 16px; letter-spacing: -0.01em; }
  .card p.nota { margin: 0 0 12px; color: var(--muted); font-size: 13.5px; line-height: 1.6; }
  .leyenda { display: flex; flex-wrap: wrap; gap: 10px; }
  .chip {
    display: inline-flex; align-items: center; gap: 8px; border-radius: 999px;
    padding: 7px 15px; font-size: 13px; font-weight: 600; border: 1.5px solid;
  }
  .chip .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .c-verde    { background: var(--verde-bg);    color: var(--verde);    border-color: #b6e6b6; }
  .c-verde .dot    { background: var(--verde); }
  .c-amarillo { background: var(--amarillo-bg); color: var(--amarillo); border-color: #f0dca0; }
  .c-amarillo .dot { background: #e0a800; }
  .c-rojo     { background: var(--rojo-bg);     color: var(--rojo);     border-color: #f3bcb4; }
  .c-rojo .dot     { background: var(--rojo); }
  .c-azul     { background: var(--azul-bg);     color: var(--azul);     border-color: #c7d8f7; }
  .c-azul .dot     { background: var(--azul); }
  .c-morado   { background: var(--morado-bg);   color: var(--morado);   border-color: #d3c8f5; }
  .c-morado .dot   { background: var(--morado); }
  .graph-wrap { overflow: auto; padding: 10px 0 4px; }
  #graph { display: flex; justify-content: center; min-width: 320px; }
  #graph svg { max-width: 100%; height: auto; }
  .toolbar { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
  button {
    font: inherit; font-size: 13px; font-weight: 600; padding: 9px 16px;
    border-radius: 10px; border: 1px solid #cfd8e6; background: #fff; color: var(--ink);
    cursor: pointer; transition: all 0.15s ease;
  }
  button:hover { background: #f0f4fb; border-color: #9fb4d6; }
  button.primary { background: var(--azul); border-color: var(--azul); color: #fff; }
  button.primary:hover { background: #1e4d94; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; vertical-align: top; padding: 9px 11px; border-bottom: 1px solid var(--line); }
  th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--muted); }
  tbody tr:hover { background: #fafbfe; }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px;
    background: #f2f5fa; border: 1px solid var(--line); border-radius: 5px; padding: 1px 5px;
  }
  .tag {
    display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 8px;
    border-radius: 6px; letter-spacing: 0.03em; white-space: nowrap;
  }
  .tag.v { background: var(--verde-bg); color: var(--verde); }
  .tag.a { background: var(--amarillo-bg); color: var(--amarillo); }
  .tag.r { background: var(--rojo-bg); color: var(--rojo); }
  ul.lista { margin: 0; padding-left: 18px; font-size: 13.5px; line-height: 1.7; color: #34404f; }
  ul.lista li::marker { color: #9aa8bb; }
  footer { margin-top: 30px; font-size: 12.5px; color: var(--muted); line-height: 1.6; }
  .error { background: var(--rojo-bg); color: var(--rojo); border: 1px solid #f3bcb4; padding: 16px; border-radius: 10px; font-size: 14px; }
  @media print { .toolbar { display: none; } body { background: #fff; } .card { box-shadow: none; } }
"""

JS = """
const diagramText = document.getElementById("diagram-source").textContent;

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "loose",
  theme: "base",
  fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  themeVariables: {
    primaryColor: "#e9f0ff",
    primaryTextColor: "#0f172a",
    primaryBorderColor: "#2b5fb0",
    lineColor: "#8b98ab",
    tertiaryColor: "#ffffff",
    fontSize: "14px"
  },
  flowchart: { curve: "basis", nodeSpacing: 38, rankSpacing: 62, padding: 14, useMaxWidth: true, htmlLabels: true }
});

(async function renderGraph() {
  try {
    const { svg } = await mermaid.render("grafoArbolDecision", diagramText);
    document.getElementById("graph").innerHTML = svg;
  } catch (err) {
    document.getElementById("graph").innerHTML =
      '<div class="error">No se pudo renderizar el diagrama.<br><pre>' + String(err) + "</pre></div>";
    console.error(err);
  }
})();

function obtenerSVGClonado() {
  const svg = document.querySelector("#graph svg");
  if (!svg) return null;
  const clon = svg.cloneNode(true);
  clon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clon.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

  const bbox = svg.getBoundingClientRect();
  const w = Math.max(bbox.width, 1200);
  const h = Math.max(bbox.height, 800);
  clon.setAttribute("width", w);
  clon.setAttribute("height", h);
  clon.setAttribute("viewBox", `0 0 ${w} ${h}`);

  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("width", "100%");
  rect.setAttribute("height", "100%");
  rect.setAttribute("fill", "#ffffff");
  clon.insertBefore(rect, clon.firstChild);

  return clon;
}

function descargarSVG() {
  const clon = obtenerSVGClonado();
  if (!clon) return alert("El diagrama aún no está listo.");
  const data = new XMLSerializer().serializeToString(clon);
  const blob = new Blob(['<?xml version="1.0" standalone="no"?>\\n' + data], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "arbol-decision-semaforo-laboral.svg";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function descargarPNG() {
  const clon = obtenerSVGClonado();
  if (!clon) return alert("El diagrama aún no está listo.");

  const data = new XMLSerializer().serializeToString(clon);
  const svg64 = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(data)));

  const escala = 2;
  const ancho = parseFloat(clon.getAttribute("width")) * escala;
  const alto = parseFloat(clon.getAttribute("height")) * escala;

  const img = new Image();
  img.onload = function () {
    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(img, 0, 0, ancho, alto);

    canvas.toBlob(function (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "arbol-decision-semaforo-laboral.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, "image/png");
  };
  img.onerror = function () {
    alert("No se pudo generar el PNG. Usa la opción de descargar SVG.");
  };
  img.src = svg64;
}
"""

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Árbol de Decisión · Semáforo Legal Laboral — iUS</title>
<style>@@CSS@@</style>
</head>
<body>

<header>
  <span class="badge">iUS · Motor de decisión</span>
  <h1>Árbol de Decisión — Semáforo Legal Laboral (iUS)</h1>
  <p>
    Generado por <code>scripts/build_ius_arbol_decision.py</code> desde
    <code>docs/ius_legal_config.json</code> (fuente de verdad del prompt del agente). No editar a mano:
    regenerá el documento con el script. @@CONTEXTO@@
  </p>
</header>

<main>

  <section class="card">
    <h2>Leyenda de nodos</h2>
    <div class="leyenda">
      <span class="chip c-azul"><span class="dot"></span>Pregunta de decisión</span>
      <span class="chip c-verde"><span class="dot"></span>Favorable / Verde</span>
      <span class="chip c-amarillo"><span class="dot"></span>Zona de riesgo / Amarillo</span>
      <span class="chip c-rojo"><span class="dot"></span>Descartado / Rojo</span>
      <span class="chip c-morado"><span class="dot"></span>Acción de cierre</span>
    </div>
  </section>

  <section class="card">
    <h2>Árbol de evaluación (@@N_PASOS@@ pasos)</h2>
    <div class="toolbar">
      <button class="primary" onclick="descargarSVG()">⬇️ Descargar SVG</button>
      <button onclick="descargarPNG()">🖼️ Descargar PNG</button>
      <button onclick="window.print()">🖨️ Imprimir</button>
    </div>
    <div class="graph-wrap">
      <div id="graph"></div>
    </div>
  </section>

  <section class="card">
    <h2>Pasos</h2>
    @@TABLA_PASOS@@
  </section>

  <section class="card">
    <h2>Plazos legales</h2>
    @@PLAZOS@@
  </section>

  <section class="card">
    <h2>Matriz de documentación</h2>
    @@MATRIZ@@
  </section>

  <section class="card">
    <h2>Señales de decisión</h2>
    @@SENALES@@
  </section>

  <section class="card">
    <h2>Intención de pago</h2>
    @@INTENCION@@
  </section>

  <section class="card">
    <h2>Semáforo final y acciones</h2>
    @@ACCIONES@@
  </section>

  <section class="card">
    <h2>Descarte inmediato</h2>
    @@DESCARTE@@
  </section>

  <section class="card">
    <h2>Reglas de calificación (@@N_REGLAS@@)</h2>
    @@TABLA_REGLAS@@
  </section>

  <section class="card">
    <h2>Restricciones de la IA</h2>
    @@RESTRICCIONES@@
  </section>

</main>

<footer>
  <strong>Nota:</strong> @@NOTA_FOOTER@@
</footer>

<script type="text/plain" id="diagram-source">@@DIAGRAMA@@</script>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
<script>@@JS@@</script>
</body>
</html>
"""


def _h(valor) -> str:
    return html.escape("—" if valor is None or valor == "" else str(valor), quote=False)


def _tag(color: str, texto: str = None) -> str:
    clase = {"verde": "v", "amarillo": "a", "rojo": "r"}.get(color)
    if not clase:
        return _h(texto or color)
    return f'<span class="tag {clase}">{_h(texto or ROTULO_COLOR.get(color, color))}</span>'


def _tabla_html(encabezados, filas, anchos=None) -> str:
    cols = "".join(f'<col style="width:{w}">' for w in anchos) if anchos else ""
    head = "".join(f"<th>{_h(h)}</th>" for h in encabezados)
    body = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in fila) + "</tr>" for fila in filas)
    return f"<table>{'<colgroup>' + cols + '</colgroup>' if cols else ''}<thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>"


def to_html(model: dict) -> str:
    diagrama = mermaid_diagram(model)

    filas_pasos = [
        [
            _h(paso.get("numero")),
            _h(paso.get("pregunta")),
            _h(paso.get("criterio")),
            _h(_datos_paso(paso, model)),
            _h(", ".join(paso.get("nodos_flow") or []) or "—"),
            _h(_salida_paso(paso, model)),
        ]
        for paso in model["pasos"]
    ]
    tabla_pasos = _tabla_html(
        ["Nº", "Pregunta", "Criterio", "Datos", "Nodos del flow", "Resultado"],
        filas_pasos, anchos=["3%", "18%", "28%", "22%", "17%", "12%"],
    )

    filas_plazos = [[_h(c) for c in fila] for fila in _md_plazos(model)]
    plazos = (
        _tabla_html(
            ["Institución", "Ley", "Plazo total", "Favorable", "Límite", "Prescripción"],
            filas_plazos,
        )
        + f'<p class="nota"><strong>Conteo:</strong> {_h(model["plazos"].get("conteo"))}. '
        + f'<strong>Interrupción:</strong> {_h(model["plazos"].get("interrupcion"))}</p>'
        + "<p class=\"nota\"><strong>Otros plazos:</strong> "
        + "; ".join(f"{_h(k)} = {_h(v)}" for k, v in (model["plazos"].get("otros") or {}).items())
        + "</p>"
        + f'<p class="nota">{_h(model["plazos"].get("instruccion"))}</p>'
    )

    matriz = (
        f'<p class="nota">{_h(model["matriz"].get("instruccion"))}</p>'
        + _tabla_html(
            ["Bloque", "Color", "Criterio"],
            [[_h(b.get("etiqueta")), _tag(b.get("color")), _h(b.get("criterio"))] for b in (model["matriz"].get("bloques") or [])],
        )
    )

    senales = f'<p class="nota">{_h(model["senales"].get("instruccion"))}</p>'
    for clave, titulo in (("positivas", "Positivas"), ("limite", "Límite"), ("negativas", "Negativas")):
        senales += f"<h3>{titulo}</h3>" + _tabla_html(
            ["Señal", "Condición"],
            [[_h(s.get("texto")), f'<code>{_h(s.get("condicion"))}</code>'] for s in (model["senales"].get(clave) or [])],
        )

    intencion = model["intencion"]
    intencion_html = (
        f'<p class="nota">{_h(intencion.get("instruccion"))} Precio de referencia: '
        f'<strong>${model["precio"]:,} {_h(model["moneda"])}</strong> '
        f'(<code>{_h(intencion.get("precio_ref"))}</code>).</p>'
        + _tabla_html(
            ["Nivel", "Señales", "Acción"],
            [
                [
                    _h(nivel),
                    "; ".join(_h(s) for s in ((intencion.get(nivel) or {}).get("señales") or [])),
                    _h((intencion.get(nivel) or {}).get("accion")),
                ]
                for nivel in ("alta", "duda", "rechazo")
            ],
        )
    )

    acciones = (
        f'<p class="nota">{_h(model["acciones"].get("instruccion"))}</p>'
        + _tabla_html(
            ["Color", "Acción de cierre", "Nodo del flow"],
            [
                [
                    _tag(color),
                    _h((model["acciones"].get(color) or {}).get("accion")),
                    f'<code>{_h((model["acciones"].get(color) or {}).get("nodo_flow"))}</code>',
                ]
                for color in ("verde", "amarillo", "rojo")
            ],
        )
    )

    descarte = (
        f'<p class="nota">{_h(model["descarte"].get("instruccion"))}</p>'
        + _tabla_html(
            ["Criterio", "Regla"],
            [[_h(c.get("texto")), f'<code>{_h(c.get("regla"))}</code>'] for c in (model["descarte"].get("criterios") or [])],
        )
    )

    tabla_reglas = _tabla_html(
        ["#", "Regla", "Color", "Condiciones", "Pendiente de validación legal", "Texto"],
        [
            [
                _h(regla.get("precedencia")),
                f'<code>{_h(regla.get("nombre"))}</code>',
                _tag(regla.get("color")),
                _h(_filtros(regla, model["umbrales"])),
                "sí" if regla.get("pendiente_validacion_legal") else "—",
                _h(regla.get("texto")),
            ]
            for regla in model["reglas"]
        ],
        anchos=["13%", "8%", "26%", "10%", "43%"],
    )

    restricciones = model["restricciones"]
    restricciones_html = ""
    for clave, titulo in (
        ("frase_base_obligatoria", "Frase base obligatoria"),
        ("actions", "Acciones prohibidas"),
        ("phrases", "Frases prohibidas"),
        ("prohibido_asegurar", "Prohibido asegurar"),
        ("prohibido_montos", "Prohibido mencionar montos"),
        ("prohibido_modelos_de_pago", "Prohibido comunicar modelos de pago"),
        ("use_instead", "En su lugar"),
    ):
        valor = restricciones.get(clave)
        if not valor:
            continue
        if isinstance(valor, str):
            restricciones_html += f"<p><strong>{titulo}:</strong> {_h(valor)}</p>"
        else:
            items = "".join(f"<li>{_h(item)}</li>" for item in valor)
            restricciones_html += f"<p><strong>{titulo}:</strong></p><ul class=\"lista\">{items}</ul>"

    nota_footer = (
        f"Conteo de plazos en {_h(model['plazos'].get('conteo'))}. {_h(model['plazos'].get('interrupcion'))} "
        f"El costo de referencia de la asesoría es de <strong>${model['precio']:,} {_h(model['moneda'])}</strong> "
        "y es independiente de cualquier servicio posterior o contrato legal."
    )

    contexto = (
        f"{len(model['reglas'])} reglas de calificación, "
        f"{sum(1 for r in model['reglas'] if r.get('pendiente_validacion_legal'))} de ellas pendientes de validación legal."
    )

    return (
        HTML_TEMPLATE.replace("@@CSS@@", CSS)
        .replace("@@JS@@", JS)
        .replace("@@CONTEXTO@@", html.escape(contexto, quote=False))
        .replace("@@N_PASOS@@", str(len(model["pasos"])))
        .replace("@@N_REGLAS@@", str(len(model["reglas"])))
        .replace("@@DIAGRAMA@@", diagrama)
        .replace("@@TABLA_PASOS@@", tabla_pasos)
        .replace("@@PLAZOS@@", plazos)
        .replace("@@MATRIZ@@", matriz)
        .replace("@@SENALES@@", senales)
        .replace("@@INTENCION@@", intencion_html)
        .replace("@@ACCIONES@@", acciones)
        .replace("@@DESCARTE@@", descarte)
        .replace("@@TABLA_REGLAS@@", tabla_reglas)
        .replace("@@RESTRICCIONES@@", restricciones_html)
        .replace("@@NOTA_FOOTER@@", nota_footer)
    )


def main():
    ap = argparse.ArgumentParser(description="Genera el árbol de decisión de iUS (MD + HTML) desde el JSON canónico")
    ap.add_argument("--config", default=str(DEFAULT_CONFIG))
    ap.add_argument("--md-out", default=str(DEFAULT_MD))
    ap.add_argument("--html-out", default=str(DEFAULT_HTML))
    args = ap.parse_args()

    config = json.loads(Path(args.config).read_text(encoding="utf-8"))
    model = build_model(config)

    md = to_markdown(model)
    md_path = Path(args.md_out)
    md_path.write_text(md, encoding="utf-8")

    html_path = Path(args.html_out)
    html_path.write_text(to_html(model), encoding="utf-8")

    print(
        f"{md_path}: {len(model['pasos'])} pasos, {len(model['reglas'])} reglas, "
        f"{len(model['terminales'])} terminales; {len(md.encode())} bytes"
    )
    print(f"{html_path}: {html_path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
