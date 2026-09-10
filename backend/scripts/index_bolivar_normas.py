#!/usr/bin/env python3
"""
Indexa el corpus de normas del HCD de Bolívar (JSONL producido por
`scripts/fetch_bolivar_normas.py`) en la base de conocimiento RAG de un bot.

Pensado para correr DENTRO del contenedor del backend (necesita el volumen de
ChromaDB ya montado en CHROMA_PATH), p. ej.:

    docker compose exec -T app python scripts/index_bolivar_normas.py \
        --jsonl /tmp/normas_corpus.jsonl --bot-id bot_7b6946dceb98 --rag-results 5

El bot destino es dueño del canal del chat de pachoteayuda.ar
(channel_96ad03bc1a1d — ver sites/pachoteayuda-landing/chat-widget.js).

Cada norma se indexa como UN documento (doc_id = `norma_<sha1 del url>`), con
metadatos {title, numero, seccion, fecha, url, type} por chunk, chunking 700/120
y la identidad de la norma repetida al frente de cada chunk (medido: sube el
recall@5 por título de 45 % a 80 % en el corpus del HCD). El contexto que ve el
LLM incluye esos metadatos como encabezado de fuente (ver
RAGService.get_context), así las respuestas pueden citar número de norma y
enlace exactos.

Idempotente: re-ejecutarlo saltea las normas ya indexadas. `--purge` borra
antes todas las normas (doc_id `norma_*`) de ese bot, sin tocar el resto de sus
documentos. `--rag-results 5` además fija config.rag_results_count del bot.

IMPORTANTE: el proceso de la app cachea la colección de Chroma; después de
indexar hay que reiniciarla para que el chat vea los chunks nuevos:

    docker compose restart app
"""

import argparse
import json
import os
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from langchain.text_splitter import RecursiveCharacterTextSplitter  # noqa: E402

from app.rag_service import get_rag_service  # noqa: E402

BATCH = 256


def clean(text: str) -> str:
    text = text.replace("\f", "\n")
    text = "".join(c for c in text if c == "\n" or c == "\t" or unicodedata.category(c)[0] != "C")
    lines = [ln.rstrip() for ln in text.split("\n")]
    out, blank = [], 0
    for ln in lines:
        blank = blank + 1 if not ln.strip() else 0
        if blank <= 2:
            out.append(ln)
    return "\n".join(out).strip()


def identity(rec: dict) -> str:
    titulo = (rec.get("titulo") or "").strip()
    numero = (rec.get("numero") or "").strip()
    if numero and numero not in titulo:
        return f"[{numero}] {titulo}"
    return titulo


def build_text(rec: dict) -> str:
    cabecera = identity(rec)
    url = (rec.get("url") or "").strip()
    texto = clean(rec.get("texto") or "")
    if not texto:
        return (f"{cabecera}\n\nNorma del Honorable Concejo Deliberante de "
                f"San Carlos de Bolívar SIN TEXTO DIGITALIZADO en el archivo "
                f"oficial. Sección: {rec.get('seccion', '')}. Fecha de "
                f"sanción/publicación: {rec.get('fecha', '')}. El texto completo "
                f"se consulta en el archivo PDF: {url}")
    return f"{cabecera}\n\n{texto}"


def load_corpus(path: str) -> dict:
    recs = {}
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            recs[rec["id"]] = rec  # last wins
    return recs


def existing_norm_ids(collection, bot_id: str, recs) -> set:
    """doc_ids del bot ya indexados, consultando sólo el primer chunk de cada norma.

    Se consulta por id (no por metadata) para no traer decenas de miles de
    metadatos a memoria; los ids llevan el bot_id adelante justamente para que
    dos bots puedan indexar el mismo corpus sin pisarse.
    """
    ids = [f"{bot_id}:{r['id']}_0" for r in recs]
    done = set()
    for i in range(0, len(ids), 500):
        res = collection.get(ids=ids[i:i + 500], include=[])
        for cid in res["ids"]:
            done.add(cid.split(":", 1)[1].rsplit("_", 1)[0])
    return done


def purge_norms(collection, bot_id: str) -> int:
    res = collection.get(where={"bot_id": bot_id}, include=["metadatas"])
    ids = [cid for cid, meta in zip(res["ids"], res["metadatas"] or [])
           if str((meta or {}).get("doc_id", "")).startswith("norma_")]
    for i in range(0, len(ids), 500):
        collection.delete(ids=ids[i:i + 500])
    return len(ids)


def set_rag_results(bot_id: str, count: int):
    """Sube `config.rag_results_count` del bot (chunks recuperados por consulta).

    Con una base de conocimiento de miles de normas, recuperar 3 chunks suele
    quedarse corto; 5 entra cómodo en el presupuesto de contexto de
    `RAGService.get_context` (max_tokens=1500).
    """
    import asyncio

    from sqlalchemy import select

    from app.db.database import AsyncSessionLocal
    from app.db.models import Bot

    async def run():
        async with AsyncSessionLocal() as session:
            bot = (await session.execute(
                select(Bot).where(Bot.bot_id == bot_id))).scalars().first()
            if bot is None:
                return None
            cfg = dict(bot.config or {})
            old = cfg.get("rag_results_count")
            cfg["rag_results_count"] = count
            bot.config = cfg
            await session.commit()
            return old

    return asyncio.run(run())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--jsonl", required=True)
    ap.add_argument("--bot-id", required=True)
    ap.add_argument("--chunk-size", type=int, default=700,
                    help="El embedder trunca a 128 tokens (~450 chars): chunks más "
                         "grandes dejan la mitad del texto fuera del embedding")
    ap.add_argument("--chunk-overlap", type=int, default=120)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--purge", action="store_true",
                    help="Borrar antes todas las normas (doc_id norma_*) de ese bot")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--rag-results", type=int, default=0,
                    help="Además, fijar config.rag_results_count del bot a este valor")
    args = ap.parse_args()

    recs = load_corpus(args.jsonl)
    print(f"Corpus: {len(recs)} normas únicas", flush=True)

    rag = get_rag_service()
    collection = rag.collection

    if not args.dry_run:
        if args.purge:
            print(f"Purge: {purge_norms(collection, args.bot_id)} chunks borrados", flush=True)
        done = existing_norm_ids(collection, args.bot_id, recs.values())
    else:
        done = set()

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=args.chunk_size, chunk_overlap=args.chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""])

    pend = [r for r in recs.values() if r["id"] not in done]
    if args.limit:
        pend = pend[:args.limit]
    print(f"Normas a indexar: {len(pend)} (ya indexadas: {len(done)})", flush=True)

    empty_text = sum(1 for r in pend if not (r.get("texto") or "").strip())
    print(f"  sin texto digitalizado: {empty_text}", flush=True)

    total_chunks = 0
    buf_ids, buf_docs, buf_meta = [], [], []

    def flush():
        nonlocal total_chunks, buf_ids, buf_docs, buf_meta
        if not buf_ids:
            return
        embs = rag.embedder.encode(buf_docs, show_progress_bar=False,
                                   convert_to_numpy=True).tolist()
        collection.add(ids=buf_ids, documents=buf_docs, embeddings=embs,
                       metadatas=buf_meta)
        total_chunks += len(buf_ids)
        buf_ids, buf_docs, buf_meta = [], [], []

    for n, rec in enumerate(pend, 1):
        text = build_text(rec)
        chunks = splitter.split_text(text) or [text]
        # La identidad de la norma va en TODOS los chunks: es lo que hace que
        # el título siga siendo recuperable en las normas largas (presupuestos,
        # códigos, impositivas), donde el título sólo vive en el primer chunk.
        cabecera = identity(rec)
        for i, ch in enumerate(chunks):
            if i and cabecera and not ch.startswith(cabecera):
                ch = f"{cabecera}\n{ch}"
            buf_ids.append(f"{args.bot_id}:{rec['id']}_{i}")
            buf_docs.append(ch)
            buf_meta.append({
                "bot_id": args.bot_id,
                "doc_id": rec["id"],
                "chunk_index": i,
                "total_chunks": len(chunks),
                "type": "norma",
                "title": rec.get("titulo", ""),
                "numero": rec.get("numero", ""),
                "seccion": rec.get("seccion", ""),
                "fecha": rec.get("fecha", ""),
                "url": rec.get("url", ""),
                "source": rec.get("url", ""),
            })
        if len(buf_ids) >= BATCH:
            if not args.dry_run:
                flush()
            else:
                total_chunks += len(buf_ids)
                buf_ids, buf_docs, buf_meta = [], [], []
        if n % 250 == 0:
            print(f"  {n}/{len(pend)} normas — {total_chunks} chunks", flush=True)

    if not args.dry_run:
        flush()
    else:
        total_chunks += len(buf_ids)

    print(f"FIN: {total_chunks} chunks indexados para bot {args.bot_id}", flush=True)
    print(f"Total en la colección: {collection.count()}", flush=True)

    if args.rag_results and not args.dry_run:
        old = set_rag_results(args.bot_id, args.rag_results)
        if old is None:
            print(f"WARN: bot {args.bot_id} no existe en la DB — rag_results_count sin cambios",
                  flush=True)
        else:
            print(f"rag_results_count: {old} → {args.rag_results}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
