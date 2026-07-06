"""
Document Router - Gestión de documentos RAG scoped por bot.

Reemplaza a los endpoints /api/documents/* y /api/rag/* de main.py (main.py:276-457
en su versión previa), que operaban sobre una única colección ChromaDB global
compartida por todos los bots, sin ningún control de ownership. Cada documento
ahora pertenece a un bot_id, y cada endpoint verifica que el bot sea del usuario
autenticado (mismo patrón que appointments_router.py).
"""

import os
import shutil
import uuid as _uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel

from app.dependencies.auth import require_role
from app.models.bot import Bot
from app.rag_service import get_rag_service
from app.services.bot_service import get_bot_service

router = APIRouter(
    prefix="/api/bots/{bot_id}/documents",
    tags=["documents"],
    dependencies=[Depends(require_role("super_admin"))],
)


async def verify_bot_access(bot_id: str) -> Bot:
    """Verificar que el bot exista (configuración técnica — sólo
    administración general llega hasta acá, ver dependency del router)."""
    bot = await get_bot_service().get_bot(bot_id)
    if not bot:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bot no encontrado")
    return bot


class TextDocumentCreate(BaseModel):
    title: str
    text: str
    category: str = "general"


@router.get("")
async def list_documents(bot: Bot = Depends(verify_bot_access)):
    """Listar los documentos del agente"""
    rag = get_rag_service()
    documents = rag.list_documents(bot_id=bot.bot_id)
    return {"success": True, "documents": documents, "total": len(documents)}


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(""),
    category: str = Form("general"),
    bot: Bot = Depends(verify_bot_access),
):
    """Upload y procesar documento para RAG, asociado a este agente"""

    upload_dir = "/app/documents"
    os.makedirs(upload_dir, exist_ok=True)

    file_path = os.path.join(upload_dir, file.filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        rag = get_rag_service()
        doc_id = str(_uuid.uuid4())
        metadata = {
            "title": title or file.filename,
            "category": category,
            "uploaded_at": datetime.utcnow().isoformat(),
        }

        if file.filename.endswith(".pdf"):
            chunks_created = rag.add_pdf(file_path, bot_id=bot.bot_id, metadata=metadata, doc_id=doc_id)
        elif file.filename.endswith(".docx"):
            chunks_created = rag.add_docx(file_path, bot_id=bot.bot_id, metadata=metadata, doc_id=doc_id)
        elif file.filename.endswith(".txt"):
            chunks_created = rag.add_text_file(file_path, bot_id=bot.bot_id, metadata=metadata, doc_id=doc_id)
        else:
            raise HTTPException(400, "Formato no soportado. Usa PDF, DOCX o TXT")

        return {
            "success": True,
            "doc_id": doc_id,
            "filename": file.filename,
            "chunks_created": chunks_created,
            "message": f"Documento procesado: {chunks_created} chunks creados",
        }

    except HTTPException:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(500, f"Error procesando documento: {str(e)}")


@router.post("/text")
async def add_text_document(doc: TextDocumentCreate, bot: Bot = Depends(verify_bot_access)):
    """Agregar documento de texto directamente, asociado a este agente"""
    try:
        rag = get_rag_service()
        chunks_created = rag.add_document(
            text=doc.text,
            bot_id=bot.bot_id,
            metadata={
                "title": doc.title,
                "category": doc.category,
                "source": "direct_input",
            },
        )
        return {
            "success": True,
            "title": doc.title,
            "chunks_created": chunks_created,
            "message": f"Documento agregado: {chunks_created} chunks creados",
        }
    except Exception as e:
        raise HTTPException(500, f"Error: {str(e)}")


@router.delete("/{doc_id}")
async def delete_document(doc_id: str, bot: Bot = Depends(verify_bot_access)):
    """Eliminar un documento del agente por doc_id"""
    rag = get_rag_service()
    deleted_chunks = rag.delete_document(doc_id, bot_id=bot.bot_id)
    if deleted_chunks == 0:
        raise HTTPException(404, f"Documento {doc_id} no encontrado")
    return {
        "success": True,
        "doc_id": doc_id,
        "deleted_chunks": deleted_chunks,
        "message": f"Documento eliminado: {deleted_chunks} chunks borrados",
    }


@router.get("/stats")
async def get_stats(bot: Bot = Depends(verify_bot_access)):
    """Obtener estadísticas de la base de conocimiento del agente"""
    rag = get_rag_service()
    stats = rag.get_stats(bot_id=bot.bot_id)
    return {"success": True, "stats": stats}


@router.delete("")
async def clear_bot_documents(
    confirm: Optional[str] = Query(None),
    bot: Bot = Depends(verify_bot_access),
):
    """Vaciar toda la base de conocimiento del agente (requiere ?confirm=ELIMINAR)"""
    if confirm != "ELIMINAR":
        raise HTTPException(400, "Confirmación requerida: pasá ?confirm=ELIMINAR")
    rag = get_rag_service()
    deleted = rag.clear_bot_documents(bot_id=bot.bot_id)
    return {"success": True, "deleted_chunks": deleted, "message": f"{deleted} chunks eliminados"}
