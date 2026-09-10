#!/usr/bin/env python3
"""
Baja la grilla de normas del HCD de Bolívar (hcdbolivar.gob.ar) y arma el
corpus JSONL que después indexa `backend/scripts/index_bolivar_normas.py`.

Corre en la MÁQUINA DE TRABAJO (no dentro del contenedor): necesita curl,
poppler (`pdftotext`/`pdftoppm`) y, para las normas escaneadas,
`tesseract` + `tessdata` de español. Los PDFs se bajan de a uno y se
descartan: nunca se guarda el corpus en disco (son ~800 MB); sólo el JSONL
final (~15 MB).

Por qué curl y no urllib: el sitio está detrás de un desafío JS anti-bot
(cookie `wssplashchk` de WebSupport). Con la cookie del desafío — que se saca
abriendo el sitio una vez en un navegador real — curl descarga a ~12/s; urllib
a ~0,1/s. Con TESSDATA_PREFIX apuntando a un tessdata con `spa` se OCR-ean las
normas escaneadas chicas (ver --ocr / --retry-scans).

Uso:
    python3 scripts/fetch_bolivar_normas.py --grid normas_enlaces.csv \
        --out normas_corpus.jsonl --cookie "<wssplashchk=...>"
    # segunda pasada: reintenta con OCR las normas que quedaron sin texto
    python3 scripts/fetch_bolivar_normas.py --grid normas_enlaces.csv \
        --out normas_corpus.jsonl --cookie "<...>" --retry-scans

Cada registro del JSONL:
    {id, seccion, fecha, titulo, numero, url, chars, origen, texto}
    origen: "pdf" | "docx" | "doc" | "ocr" | "scan" | "error"
            (scan = sin texto extraíble, error = falló la descarga)

`numero` se extrae del texto del PDF cuando se puede (el título de la grilla
suele venir corrido una fila respecto del enlace), de modo que el número de
norma que cita el RAG es el del documento real.
"""
import argparse
import concurrent.futures as cf
import csv
import hashlib
import html
import json
import os
import re
import subprocess
import sys
import tempfile
import threading

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36")

NUM_RE = re.compile(
    r"(?:ORDENANZA|DECRETO|RESOLUCI[OÓ]N|COMUNICACI[OÓ]N|DISPOSICI[OÓ]N)"
    r"[^0-9A-Za-z]{0,12}N[º°o]{0,2}[^0-9]{0,6}(\d{1,5})\s*/\s*(\d{2,4})",
    re.I)
NUM_RE2 = re.compile(r"\b(\d{1,5})\s*/\s*(\d{4})\b")

_write_lock = threading.Lock()
OCR_MAX_MB = 8


def fetch(url, cookie, dest):
    cmd = ["curl", "-sS", "--max-time", "60", "-A", UA, "-o", dest, url]
    if cookie:
        cmd[1:1] = ["-H", f"Cookie: {cookie}"]
    out = subprocess.run(cmd, capture_output=True, timeout=90)
    if out.returncode != 0:
        raise RuntimeError(out.stderr.decode()[:200] or f"curl exit {out.returncode}")
    with open(dest, "rb") as fh:
        return fh.read(8)


def pdf_text(path):
    out = subprocess.run(["pdftotext", "-layout", path, "-"],
                         capture_output=True)
    return out.stdout.decode("utf-8", "replace")


def docx_text(path):
    import zipfile
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml").decode("utf-8", "replace")
    xml = re.sub(r"</w:p>", "\n", xml)
    return html.unescape(re.sub(r"<[^>]+>", "", xml))


def doc_text(path):
    for cmd in (["catdoc", path], ["antiword", path]):
        try:
            out = subprocess.run(cmd, capture_output=True, timeout=60)
        except FileNotFoundError:
            continue
        if out.stdout:
            return out.stdout.decode("utf-8", "replace")
    return ""


def ocr_env():
    env = dict(os.environ)
    if not env.get("TESSDATA_PREFIX"):
        local = os.path.expanduser("~/.local/share/tessdata")
        if os.path.isdir(local):
            env["TESSDATA_PREFIX"] = local
    return env


def ocr_pdf(path, dpi=150, max_pages=12):
    """OCR con tesseract, devuelve texto o '' si no hay binarios.

    Acotado en páginas y DPI a propósito: hay normas escaneadas de cientos de
    páginas y el PDF→PNG intermedio (varios MB por página) es lo que llena el
    disco si se corre sin límite.
    """
    env = ocr_env()
    langs = []
    try:
        out = subprocess.run(["tesseract", "--list-langs"], capture_output=True,
                             env=env, timeout=60)
        langs = out.stdout.decode().split()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return ""
    lang = ["-l", "spa"] if "spa" in langs else (["-l", "eng"] if "eng" in langs else [])
    with tempfile.TemporaryDirectory() as td:
        pref = os.path.join(td, "p")
        try:
            subprocess.run(["pdftoppm", "-r", str(dpi), "-gray", "-png",
                            "-f", "1", "-l", str(max_pages), path, pref],
                           capture_output=True, env=env, timeout=900)
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return ""
        parts = []
        for img in sorted(os.listdir(td)):
            if not img.endswith(".png"):
                continue
            out = subprocess.run(["tesseract", os.path.join(td, img), "-", *lang],
                                 capture_output=True, env=env, timeout=900)
            parts.append(out.stdout.decode("utf-8", "replace"))
        return "\n".join(parts)


def norm_number(*texts):
    for t in texts:
        if not t:
            continue
        m = NUM_RE.search(t)
        if m:
            n, y = m.group(1), m.group(2)
            return f"{n}/{y}"
    for t in texts:
        if not t:
            continue
        m = NUM_RE2.search(t)
        if m:
            return f"{m.group(1)}/{m.group(2)}"
    m = re.search(r"\b(\d{1,5})\s*/\s*(\d{2,4})\b", texts[0] or "")
    return f"{m.group(1)}/{m.group(2)}" if m else ""


def process(row, cookie, do_ocr):
    url = row["url_archivo"].strip()
    doc_id = "norma_" + hashlib.sha1(url.encode()).hexdigest()[:16]
    rec = {
        "id": doc_id, "seccion": row["seccion"], "fecha": row["fecha"],
        "titulo": row["titulo"], "url": url, "numero": "", "chars": 0,
        "origen": "error", "texto": "", "error": "",
    }
    try:
        with tempfile.TemporaryDirectory() as td:
            fn = os.path.join(td, "a.bin")
            head = fetch(url, cookie, fn)
            if head.startswith(b"%PDF"):
                text = pdf_text(fn)
                origen = "pdf"
                if (len(text.strip()) < 80 and do_ocr
                        and os.path.getsize(fn) <= OCR_MAX_MB * 1_000_000):
                    ocr = ocr_pdf(fn)
                    if len(ocr.strip()) > len(text.strip()):
                        text, origen = ocr, "ocr"
            elif head.startswith(b"PK"):
                text, origen = docx_text(fn), "docx"
            elif head.startswith(b"\xd0\xcf\x11\xe0"):
                text, origen = doc_text(fn), "doc"
            else:
                text, origen = "", "desconocido"
        rec["texto"] = text.strip()
        rec["chars"] = len(rec["texto"])
        rec["origen"] = origen if rec["chars"] else "scan"
        rec["numero"] = norm_number(rec["titulo"], rec["texto"][:4000])
    except Exception as exc:  # noqa: BLE001
        rec["error"] = f"{type(exc).__name__}: {exc}"
    return rec


def retry_scans(args):
    """Re-descarga y OCR-ea los registros con origen=scan, reescribiendo el JSONL."""
    recs = [json.loads(l) for l in open(args.out, encoding="utf-8")]
    targets = [r for r in recs if r["origen"] == "scan"]
    print(f"Registros: {len(recs)} — a reintentar: {len(targets)}", flush=True)
    by_id = {r["id"]: r for r in recs}
    done = 0
    with cf.ThreadPoolExecutor(args.workers) as ex:
        futs = {}
        for r in targets:
            row = {"seccion": r["seccion"], "fecha": r["fecha"],
                   "titulo": r["titulo"], "url_archivo": r["url"]}
            futs[ex.submit(process, row, args.cookie, True)] = r
        for fut in cf.as_completed(futs):
            new = fut.result()
            if new["chars"] > by_id[new["id"]]["chars"]:
                by_id[new["id"]] = new
            done += 1
            if done % 50 == 0:
                print(f"{done}/{len(targets)}", flush=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        for r in recs:
            fh.write(json.dumps(by_id[r["id"]], ensure_ascii=False) + "\n")
    ok = sum(1 for r in by_id.values() if r["origen"] == "ocr")
    print(f"FIN retry-scan: {ok} recuperados por OCR", flush=True)
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--grid", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--cookie", default=os.getenv("HCD_COOKIE", ""))
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--ocr", action="store_true")
    ap.add_argument("--retry-scans", action="store_true",
                    help="Reintenta (con OCR) los registros ya volcados con origen=scan")
    args = ap.parse_args()

    if args.retry_scans:
        return retry_scans(args)

    rows = list(csv.DictReader(open(args.grid, encoding="utf-8")))
    if args.limit:
        rows = rows[:args.limit]
    print(f"Filas: {len(rows)}", flush=True)

    done_ids = set()
    if os.path.exists(args.out):
        for line in open(args.out, encoding="utf-8"):
            try:
                rec = json.loads(line)
            except Exception:  # noqa: BLE001
                continue
            if rec.get("origen") != "error":
                done_ids.add(rec["id"])
    print(f"Ya procesados: {len(done_ids)}", flush=True)

    todo = [r for r in rows
            if "norma_" + hashlib.sha1(r["url_archivo"].strip().encode()).hexdigest()[:16]
            not in done_ids]

    counts = {"pdf": 0, "ocr": 0, "scan": 0, "error": 0, "docx": 0, "doc": 0,
              "desconocido": 0}
    n = 0
    with open(args.out, "a", encoding="utf-8") as fh, \
            cf.ThreadPoolExecutor(args.workers) as ex:
        futs = {ex.submit(process, r, args.cookie, args.ocr): r for r in todo}
        for fut in cf.as_completed(futs):
            rec = fut.result()
            with _write_lock:
                fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
                fh.flush()
            counts[rec["origen"]] = counts.get(rec["origen"], 0) + 1
            n += 1
            if n % 100 == 0:
                print(f"{n}/{len(todo)} {counts}", flush=True)
    print("FIN", counts, flush=True)


if __name__ == "__main__":
    sys.exit(main())
