#!/usr/bin/env python3
"""
Genera el documento interactivo (HTML, tema claro) de consulta al abogado de
referencia de iUS a partir de `docs/qa/IUS_CONSULTA_ABOGADO_SEMAFORO.md`.

Por qué un generador y no un HTML a mano: las 6 fichas de caso citan el texto
exacto del fixture (hasta 2.6k caracteres por caso). Mantener dos copias a mano
garantiza divergencia; el .md es la fuente y este script lo convierte.

Qué agrega el HTML sobre el .md:
- Cada línea `**Definición (...)**:` del .md se convierte en un campo de
  respuesta (textarea) con look de input, en tema claro.
- Los textos de caso largos van dentro de un `<details>` (colapsados).
- Las respuestas se guardan en `localStorage`, se pueden descargar como .md o
  copiar, y se imprimen junto con el documento.

Uso:
  python3 scripts/build_ius_consulta_abogado.py            # escribe el .html
  python3 scripts/build_ius_consulta_abogado.py --out RUTA
"""

import argparse
import html
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MD = REPO_ROOT / "docs" / "qa" / "IUS_CONSULTA_ABOGADO_SEMAFORO.md"
DEFAULT_OUT = DEFAULT_MD.with_suffix(".html")

DEFINICION_RE = re.compile(r"^\*\*(Definici[oó]n[^*]*)\*\*:?\s*$")


def inline(text: str) -> str:
    """Markdown inline mínimo: code, strong, em. Escapa HTML primero."""
    out = html.escape(text, quote=False)
    out = re.sub(r"`([^`]+)`", r"<code>\1</code>", out)
    out = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", out)
    out = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", out)
    return out


def slug(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s


def blocks_of(lines):
    """Agrupa el .md en bloques: (tipo, lineas)."""
    blocks = []
    current = []

    def flush():
        if current:
            blocks.append(list(current))
            current.clear()

    for raw in lines:
        if not raw.strip():
            flush()
            continue
        current.append(raw.rstrip())
    flush()
    return blocks


def classify(block):
    first = block[0]
    if first.startswith("# "):
        return "h1"
    if first.startswith("## "):
        return "h2"
    if first.startswith("### "):
        return "h3"
    if first == "---":
        return "hr"
    if all(l.startswith("|") for l in block):
        return "table"
    if all(l.startswith("> ") for l in block):
        return "quote"
    if all(l.startswith("- ") or l.startswith("  ") for l in block):
        return "ul"
    if re.match(r"^\d+\.\s", first):
        return "ol"
    return "para"


def render_list(block, ordered):
    items = []
    for line in block:
        m = re.match(r"^(?:-|\d+\.)\s+(.*)$", line)
        if m:
            items.append([m.group(1)])
        elif items:
            items[-1].append(line.strip())
    tag = "ol" if ordered else "ul"
    body = "".join(f"<li>{inline(' '.join(it))}</li>" for it in items)
    return f"<{tag}>{body}</{tag}>"


def render_table(block):
    rows = [[c.strip() for c in l.strip("|").split("|")] for l in block]
    head, body = rows[0], [r for r in rows[2:]]
    thead = "".join(f"<th>{inline(c)}</th>" for c in head)
    tbody = "".join(
        "<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in body
    )
    return f"<table><thead><tr>{thead}</tr></thead><tbody>{tbody}</tbody></table>"


class Field:
    __slots__ = ("fid", "label", "heading", "short")

    def __init__(self, fid, label, heading, short):
        self.fid, self.label, self.heading, self.short = fid, label, heading, short


def render_md(md_text):
    """Devuelve (html_cuerpo, fields, indice_de_secciones)."""
    out = []
    fields = []
    index = []
    meta_paras = []
    seen_h2 = False
    ctx2 = ctx3 = ""
    counter = 0
    blocks = blocks_of(md_text.split("\n"))

    for i, block in enumerate(blocks):
        kind = classify(block)
        nxt = classify(blocks[i + 1]) if i + 1 < len(blocks) else None
        text = " ".join(l.strip() for l in block)

        if kind == "h1":
            # El título ya está en el encabezado de la página.
            continue
        if kind == "h2":
            title = block[0][3:]
            ctx2, ctx3 = title, ""
            sid = slug(title)
            index.append((sid, title))
            if not seen_h2:
                seen_h2 = True
                card = "".join(f"<p>{p}</p>" for p in meta_paras)
                out.append(f'<div class="meta">{card}</div>')
            out.append(f'<h2 id="{sid}">{inline(title)}</h2>')
            continue
        if kind == "h3":
            title = block[0][4:]
            ctx3 = title
            sid = slug(title)
            index.append((sid, title))
            out.append(f'<h3 id="{sid}">{inline(title)}</h3>')
            continue
        if kind == "hr":
            continue
        if kind == "table":
            out.append(render_table(block))
            continue

        definicion = DEFINICION_RE.match(text)
        if definicion:
            counter += 1
            label = definicion.group(1).rstrip(":").strip()
            heading = ctx3 or ctx2
            # Etiqueta visible del campo: "Definición D1" en las secciones D1–D3,
            # "Definición (D3c) — caso 7" en las fichas de caso.
            if label == "Definición":
                m = re.match(r"^(D\d)", ctx3 or ctx2)
                short = f"Definición {m.group(1)}" if m else "Definición"
            else:
                m = re.match(r"^(Caso \d+)", ctx2)
                short = f"{label} — {m.group(1).lower()}" if m else label
            fid = f"f{counter}"
            fields.append(Field(fid, label, heading, short))
            out.append(
                '<div class="field">'
                f'<label for="{fid}">{html.escape(short)}</label>'
                f'<textarea id="{fid}" rows="3" spellcheck="false" '
                f'placeholder="Escriba la definición…"></textarea>'
                "</div>"
            )
            continue

        if kind == "quote":
            body = "<br>".join(inline(l[2:]) for l in block)
            prev = blocks[i - 1] if i else None
            # El rótulo que precede a la cita ("Texto del caso (…)") se usa como
            # summary del <details>: el texto largo queda colapsado.
            if prev and classify(prev) == "para" and "Texto del caso" in " ".join(prev):
                summary = inline(" ".join(l.strip() for l in prev))
                out.pop()
                out.append(
                    f'<details class="caso"><summary>{summary}</summary>'
                    f"<blockquote>{body}</blockquote></details>"
                )
            else:
                out.append(f"<blockquote>{body}</blockquote>")
            continue

        if kind == "ul":
            out.append(render_list(block, ordered=False))
            continue
        if kind == "ol":
            out.append(render_list(block, ordered=True))
            continue

        # Párrafos previos al primer `##` forman la ficha de metadatos del
        # documento; el resto son texto normal o notas en cursiva.
        if not seen_h2:
            meta_paras.append(inline(text))
            continue
        cls = ' class="note"' if re.match(r"^\*[^*]", text) else ""
        out.append(f"<p{cls}>{inline(text)}</p>")

    return "\n".join(out), fields, index


CSS = """
:root{
  --ink:#0d1a3d; --ink-soft:#3c4665; --muted:#6b7590;
  --paper:#f6f8fc; --card:#ffffff; --line:#e7ebf5; --line-strong:#d3e0fb;
  --blue:#2f6fed; --blue-soft:#eef3ff; --amber:#f5b731; --green:#25c46b; --red:#e5484d;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0; background:var(--paper); color:var(--ink-soft);
  font:15px/1.62 var(--sans);
}
.layout{max-width:1080px;margin:0 auto;padding:0 24px 96px}
header.top{
  background:#fff; border-bottom:1px solid var(--line);
  padding:34px 0 26px; margin-bottom:28px;
}
header.top .inner{max-width:1080px;margin:0 auto;padding:0 24px}
h1{font-size:27px;line-height:1.25;color:var(--ink);margin:0 0 6px;letter-spacing:-.2px}
.sub{color:var(--muted);font-size:13px;margin:0 0 20px}
h2{
  font-size:19px;color:var(--ink);margin:44px 0 14px;padding-top:18px;
  border-top:1px solid var(--line);letter-spacing:-.1px;
}
h2:first-of-type{border-top:0;padding-top:0}
h3{font-size:16px;color:var(--ink);margin:30px 0 10px}
p{margin:11px 0}
strong{color:var(--ink)}
a{color:var(--blue);text-decoration:none}
a:hover{text-decoration:underline}
code{
  font-family:var(--mono);font-size:12.5px;background:var(--blue-soft);
  border:1px solid var(--line-strong);border-radius:5px;padding:1px 5px;color:#22406f;
}
ul,ol{margin:11px 0;padding-left:22px}
li{margin:6px 0}
li>strong{color:var(--ink)}

.meta{background:#fff;border:1px solid var(--line);border-radius:12px;padding:6px 18px 14px;margin:0 0 8px}
.meta p{font-size:14px}

nav.toc{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 18px;margin:22px 0 6px}
nav.toc h2{border:0;margin:0 0 8px;padding:0;font-size:14px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)}
nav.toc ul{columns:2;column-gap:26px;list-style:none;padding:0;margin:0}
nav.toc li{margin:3px 0;font-size:14px}

table{width:100%;border-collapse:collapse;margin:16px 0;background:#fff;font-size:13.5px}
th,td{border:1px solid var(--line);padding:8px 11px;text-align:left;vertical-align:top}
th{background:var(--blue-soft);color:var(--ink);font-weight:600;font-size:13px}

details.caso{background:#fff;border:1px solid var(--line);border-radius:12px;padding:0;margin:14px 0}
details.caso>summary{
  cursor:pointer;padding:12px 16px;font-size:13.5px;color:var(--blue);font-weight:600;
  list-style:none;display:flex;align-items:center;gap:8px;
}
details.caso>summary::-webkit-details-marker{display:none}
details.caso>summary::before{content:"▸";color:var(--muted);font-weight:400}
details.caso[open]>summary::before{content:"▾"}
details.caso>summary:hover{background:var(--blue-soft);border-radius:12px}
details.caso blockquote{margin:0;border-top:1px solid var(--line)}

blockquote{
  margin:14px 0;padding:13px 16px;background:#fff;border-left:3px solid var(--line-strong);
  border-radius:0 10px 10px 0;color:var(--ink-soft);font-size:14px;
}
.note{background:#fffaef;border:1px solid #f6e3b6;border-radius:10px;padding:10px 14px;font-size:14px}

/* Campo de respuesta */
.field{margin:14px 0 26px}
.field>label{
  display:block;font-size:11.5px;text-transform:uppercase;letter-spacing:.7px;
  color:var(--muted);margin-bottom:6px;font-weight:600;
}
.field textarea{
  display:block;width:100%;min-height:74px;resize:vertical;
  font:14.5px/1.55 var(--sans);color:var(--ink);background:#fff;
  border:1px solid var(--line-strong);border-radius:10px;padding:11px 13px;
  box-shadow:inset 0 1px 2px rgba(13,26,61,.04);outline:none;
  transition:border-color .15s,box-shadow .15s;
}
.field textarea::placeholder{color:#a4adc4}
.field textarea:hover{border-color:#b9cdf3}
.field textarea:focus{
  border-color:var(--blue);box-shadow:0 0 0 3px rgba(47,111,237,.15),inset 0 1px 2px rgba(13,26,61,.04);
  background:#fdfefe;
}
.field .hint{font-size:12px;color:var(--muted);margin-top:5px;display:none}
.field[data-filled="1"]>label{color:var(--blue)}
.field[data-filled="1"] .hint{display:block}

.toolbar{
  position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:10px;align-items:center;
  background:rgba(246,248,252,.94);backdrop-filter:blur(6px);
  padding:12px 24px;margin:0 -24px 8px;border-bottom:1px solid var(--line);
}
.btn{
  font:600 13px var(--sans);color:var(--ink);background:#fff;border:1px solid var(--line-strong);
  border-radius:9px;padding:8px 14px;cursor:pointer;transition:background .15s,border-color .15s;
}
.btn:hover{background:var(--blue-soft);border-color:#b9cdf3}
.btn.primary{background:var(--blue);border-color:var(--blue);color:#fff}
.btn.primary:hover{background:#255ed1;border-color:#255ed1}
.status{font-size:12.5px;color:var(--muted);margin-left:auto}

.badge{
  display:inline-block;font:600 11.5px var(--sans);letter-spacing:.3px;
  border-radius:999px;padding:2px 9px;border:1px solid var(--line-strong);color:#22406f;background:var(--blue-soft);
}
.badge.verde{background:#eafaf1;border-color:#bfe9d1;color:#14713d}
.badge.amarillo{background:#fff7e4;border-color:#f2dda5;color:#8a6300}
.badge.rojo{background:#fdeeee;border-color:#f4cccc;color:#9c2a2d}

footer.foot{
  margin-top:56px;padding-top:20px;border-top:1px solid var(--line);
  font-size:12.5px;color:var(--muted);
}

@media print{
  .toolbar,nav.toc{display:none}
  body{background:#fff;font-size:11.5pt}
  .layout{max-width:none;padding:0}
  header.top{border:0;padding:0 0 10px}
  details.caso{border:0}
  details.caso>summary{display:none}
  details.caso blockquote{border:0;padding:0}
  .field textarea{
    border:1px solid #ccc;box-shadow:none;min-height:60px;background:#fff;
  }
  h2{page-break-after:avoid}
  .field{page-break-inside:avoid}
}
"""

JS = """
(function(){
  var KEY = "ius-consulta-abogado-v1";
  var fields = Array.prototype.slice.call(document.querySelectorAll(".field textarea"));
  var meta = JSON.parse(document.getElementById("fields-meta").textContent);
  var status = document.getElementById("status");

  function label(fid, i){
    var m = meta[i] || {};
    var head = m.heading || "General";
    // En D1–D3 el encabezado ya es la definición; en las fichas de caso se
    // antepone el caso al rótulo ("Caso 7 — … · Definición (D3c)").
    if (!m.label || m.label === "Definición") return head;
    return head.indexOf("Caso ") === 0 ? (head + " · " + m.label) : m.label;
  }
  function save(){
    var data = {};
    fields.forEach(function(f){ data[f.id] = f.value; });
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch(e){}
    updateStatus();
  }
  function updateStatus(){
    var n = fields.filter(function(f){ return f.value.trim(); }).length;
    status.textContent = n ? (n + " de " + fields.length + " respuestas guardadas en este navegador")
                           : "Sin respuestas todavía (" + fields.length + " campos)";
    fields.forEach(function(f){
      var box = f.closest(".field");
      if (box) box.setAttribute("data-filled", f.value.trim() ? "1" : "0");
    });
  }
  function grow(f){
    f.style.height = "auto";
    f.style.height = Math.max(74, f.scrollHeight + 2) + "px";
  }
  function report(){
    var parts = ["# iUS — Semáforo: respuestas del abogado de referencia", "",
                 "Fecha: " + new Date().toISOString().slice(0,10), ""];
    fields.forEach(function(f, i){
      var v = f.value.trim();
      parts.push("## " + label(f.id, i));
      parts.push("");
      parts.push(v ? v : "_Sin respuesta._");
      parts.push("");
    });
    return parts.join("\\n");
  }
  fields.forEach(function(f, i){
    try {
      var data = JSON.parse(localStorage.getItem(KEY) || "{}");
      if (data[f.id]) f.value = data[f.id];
    } catch(e){}
    f.addEventListener("input", function(){ save(); grow(f); });
    grow(f);
  });
  updateStatus();

  document.getElementById("btn-md").addEventListener("click", function(){
    var blob = new Blob([report()], {type:"text/markdown;charset=utf-8"});
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "IUS_RESPUESTAS_ABOGADO.md";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  });
  document.getElementById("btn-copy").addEventListener("click", function(){
    var btn = this;
    navigator.clipboard.writeText(report()).then(function(){
      btn.textContent = "Copiado ✓";
      setTimeout(function(){ btn.textContent = "Copiar respuestas"; }, 1600);
    });
  });
  document.getElementById("btn-print").addEventListener("click", function(){
    document.querySelectorAll("details.caso").forEach(function(d){ d.open = true; });
    window.print();
  });
})();
"""

HTML = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>iUS — Consulta al abogado de referencia (semáforo)</title>
<style>@@CSS@@</style>
</head>
<body>
<header class="top">
  <div class="inner">
    <h1>iUS — Semáforo: consulta al abogado de referencia</h1>
    <p class="sub">6 casos abiertos de la suite de calificación · definiciones D1–D3 · documento generado desde
      <code>docs/qa/IUS_CONSULTA_ABOGADO_SEMAFORO.md</code></p>
  </div>
</header>

<div class="layout">
  <nav class="toc"><h2>Contenido</h2><ul>@@TOC@@</ul></nav>

  <p class="sub">Las respuestas se escriben en los campos, se guardan en este navegador (localStorage) y se
    pueden descargar como <code>.md</code> o imprimir junto con el documento.</p>

  <div class="toolbar">
    <button class="btn primary" id="btn-md" type="button">Descargar respuestas (.md)</button>
    <button class="btn" id="btn-copy" type="button">Copiar respuestas</button>
    <button class="btn" id="btn-print" type="button">Imprimir / PDF</button>
    <span class="status" id="status"></span>
  </div>

@@BODY@@

  <footer class="foot">
    Generado con <code>scripts/build_ius_consulta_abogado.py</code> — no editar el HTML a mano:
    editar el <code>.md</code> y regenerar.
  </footer>
</div>

<script id="fields-meta" type="application/json">@@META@@</script>
<script>@@JS@@</script>
</body>
</html>
"""


def main():
    ap = argparse.ArgumentParser(description="Genera el HTML interactivo de la consulta al abogado")
    ap.add_argument("--md", default=str(DEFAULT_MD))
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    args = ap.parse_args()

    md_path = Path(args.md)
    body, fields, index = render_md(md_path.read_text(encoding="utf-8"))
    toc = "".join(f'<li><a href="#{sid}">{html.escape(title)}</a></li>' for sid, title in index)
    meta = [{"id": f.fid, "label": f.label, "heading": f.heading} for f in fields]
    doc = (
        HTML.replace("@@CSS@@", CSS)
        .replace("@@JS@@", JS)
        .replace("@@TOC@@", toc)
        .replace("@@BODY@@", body)
        .replace("@@META@@", __import__("json").dumps(meta, ensure_ascii=False))
    )
    out = Path(args.out)
    out.write_text(doc, encoding="utf-8")
    print(f"{out}: {len(fields)} campos de respuesta, {len(index)} secciones, {len(doc)} bytes")


if __name__ == "__main__":
    main()
