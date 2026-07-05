#!/usr/bin/env python3
"""
Wipea la colección ChromaDB `knowledge_base` completa.

Uso (dentro del contenedor del backend, no en el host — requiere chromadb y
el modelo de embeddings ya cargados por la app):

    docker compose exec app python scripts/wipe_knowledge_base.py

Necesario una única vez al desplegar el aislamiento de RAG por bot_id: los
documentos existentes no tienen bot_id y quedarían huérfanos (invisibles a
cualquier búsqueda scoped, pero ocupando espacio). Después de este wipe, cada
documento subido nuevamente vía /api/bots/{bot_id}/documents queda asociado
a su agente correspondiente.
"""

import sys

from app.rag_service import get_rag_service


def main() -> None:
    rag = get_rag_service()
    stats = rag.get_stats()

    print(f"Colección: {stats['collection_name']}")
    print(f"Chunks a borrar: {stats['total_chunks']}")
    print()

    confirm = input('Escribí "SI, BORRAR TODO" para continuar: ')
    if confirm != "SI, BORRAR TODO":
        print("Cancelado.")
        sys.exit(1)

    rag.clear_collection()
    print("✅ Colección knowledge_base wipeada.")


if __name__ == "__main__":
    main()
