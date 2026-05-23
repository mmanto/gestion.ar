"""
RAG Service - Retrieval-Augmented Generation
Gestiona la base de conocimiento vectorial con ChromaDB y Sentence-Transformers
"""

import os
from typing import List, Dict
import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer
from langchain.text_splitter import RecursiveCharacterTextSplitter
from pypdf import PdfReader
from docx import Document as DocxDocument


class RAGService:
    """Servicio RAG completo para WhatsApp chatbot"""

    def __init__(
        self,
        chroma_path: str = "./chroma_db",
        embedding_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
        chunk_size: int = 500,
        chunk_overlap: int = 50
    ):
        """
        Inicializar servicio RAG

        Args:
            chroma_path: Ruta para ChromaDB
            embedding_model: Modelo de embeddings (pequeño y multiidioma)
            chunk_size: Tamaño de chunks (tokens)
            chunk_overlap: Overlap entre chunks
        """

        # ChromaDB client
        self.chroma_client = chromadb.PersistentClient(
            path=chroma_path,
            settings=Settings(allow_reset=True)
        )

        # Colección principal
        self.collection = self.chroma_client.get_or_create_collection(
            name="knowledge_base",
            metadata={"hnsw:space": "cosine"}
        )

        # Modelo de embeddings (384 dimensiones, liviano)
        print("📥 Cargando modelo de embeddings...")
        self.embedder = SentenceTransformer(embedding_model)
        print(f"✅ Modelo cargado ({self.embedder.get_sentence_embedding_dimension()} dimensiones)")

        # Text splitter
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", ". ", " ", ""]
        )

    def add_document(
        self,
        text: str,
        metadata: Dict = None,
        doc_id: str = None
    ) -> int:
        """
        Agregar documento a la base de conocimiento

        Returns:
            Número de chunks creados
        """

        # Dividir en chunks
        chunks = self.text_splitter.split_text(text)

        # Generar IDs únicos
        if not doc_id:
            import uuid
            doc_id = str(uuid.uuid4())

        chunk_ids = [f"{doc_id}_{i}" for i in range(len(chunks))]

        # Generar embeddings
        embeddings = self.embedder.encode(
            chunks,
            show_progress_bar=False,
            convert_to_numpy=True
        ).tolist()

        # Metadata por chunk
        metadatas = [
            {
                **(metadata or {}),
                "chunk_index": i,
                "total_chunks": len(chunks),
                "doc_id": doc_id
            }
            for i in range(len(chunks))
        ]

        # Agregar a ChromaDB
        self.collection.add(
            ids=chunk_ids,
            documents=chunks,
            embeddings=embeddings,
            metadatas=metadatas
        )

        return len(chunks)

    def add_pdf(self, pdf_path: str, metadata: Dict = None, doc_id: str = None) -> int:
        """Agregar PDF a la base de conocimiento"""

        text = ""
        with open(pdf_path, 'rb') as file:
            pdf_reader = PdfReader(file)
            for page in pdf_reader.pages:
                text += page.extract_text() + "\n\n"

        return self.add_document(
            text,
            metadata={
                **(metadata or {}),
                "source": pdf_path,
                "type": "pdf"
            },
            doc_id=doc_id
        )

    def add_docx(self, docx_path: str, metadata: Dict = None, doc_id: str = None) -> int:
        """Agregar DOCX a la base de conocimiento"""

        doc = DocxDocument(docx_path)
        text = "\n\n".join([para.text for para in doc.paragraphs])

        return self.add_document(
            text,
            metadata={
                **(metadata or {}),
                "source": docx_path,
                "type": "docx"
            },
            doc_id=doc_id
        )

    def add_text_file(self, file_path: str, metadata: Dict = None, doc_id: str = None) -> int:
        """Agregar archivo de texto"""

        with open(file_path, 'r', encoding='utf-8') as f:
            text = f.read()

        return self.add_document(
            text,
            metadata={
                **(metadata or {}),
                "source": file_path,
                "type": "txt"
            },
            doc_id=doc_id
        )

    def list_documents(self) -> List[Dict]:
        """Listar documentos únicos en la base de conocimiento"""

        if self.collection.count() == 0:
            return []

        results = self.collection.get(include=["metadatas"])

        docs: Dict[str, Dict] = {}
        for meta in results["metadatas"]:
            doc_id = meta.get("doc_id")
            if not doc_id:
                continue
            if doc_id not in docs:
                docs[doc_id] = {
                    "doc_id": doc_id,
                    "title": meta.get("title", ""),
                    "category": meta.get("category", "general"),
                    "source": meta.get("source", ""),
                    "type": meta.get("type", ""),
                    "uploaded_at": meta.get("uploaded_at", ""),
                    "chunks_count": 0,
                }
            docs[doc_id]["chunks_count"] += 1

        return list(docs.values())

    def delete_document(self, doc_id: str) -> int:
        """Eliminar todos los chunks de un documento por doc_id"""

        results = self.collection.get(
            where={"doc_id": doc_id},
            include=["metadatas"]
        )

        if not results["ids"]:
            return 0

        source_path = None
        if results["metadatas"]:
            source_path = results["metadatas"][0].get("source")

        self.collection.delete(ids=results["ids"])

        if source_path and os.path.exists(source_path):
            try:
                os.remove(source_path)
            except Exception:
                pass

        return len(results["ids"])

    def search(
        self,
        query: str,
        n_results: int = 3,
        filter_metadata: Dict = None
    ) -> List[Dict]:
        """
        Buscar documentos relevantes

        Args:
            query: Consulta del usuario
            n_results: Cantidad de resultados
            filter_metadata: Filtros opcionales

        Returns:
            Lista de documentos relevantes con scores
        """

        # Generar embedding de query
        query_embedding = self.embedder.encode(
            [query],
            convert_to_numpy=True
        ).tolist()[0]

        # Buscar en ChromaDB
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            where=filter_metadata
        )

        # Formatear resultados
        documents = []
        for i in range(len(results['ids'][0])):
            documents.append({
                "id": results['ids'][0][i],
                "text": results['documents'][0][i],
                "metadata": results['metadatas'][0][i],
                "distance": results['distances'][0][i] if 'distances' in results else None
            })

        return documents

    def get_context(
        self,
        query: str,
        n_results: int = 3,
        max_tokens: int = 1500
    ) -> str:
        """
        Obtener contexto para el LLM

        Args:
            query: Consulta del usuario
            n_results: Docs a recuperar
            max_tokens: Máximo de tokens de contexto

        Returns:
            Contexto formateado para el prompt
        """

        # Buscar documentos relevantes
        docs = self.search(query, n_results=n_results)

        if not docs:
            return ""

        # Formatear contexto
        context_parts = []
        total_length = 0

        for doc in docs:
            text = doc['text']
            # Estimar tokens (aprox 4 chars = 1 token)
            tokens = len(text) // 4

            if total_length + tokens > max_tokens:
                # Truncar si excede límite
                remaining = max_tokens - total_length
                text = text[:remaining * 4]
                context_parts.append(text)
                break

            context_parts.append(text)
            total_length += tokens

        # Formatear para el prompt
        context = "\n\n---\n\n".join(context_parts)

        return context

    def clear_collection(self):
        """Limpiar toda la colección"""
        self.chroma_client.delete_collection("knowledge_base")
        self.collection = self.chroma_client.get_or_create_collection(
            name="knowledge_base",
            metadata={"hnsw:space": "cosine"}
        )

    def get_stats(self) -> Dict:
        """Obtener estadísticas de la base de conocimiento"""

        count = self.collection.count()

        return {
            "total_chunks": count,
            "collection_name": self.collection.name,
            "embedding_dimension": self.embedder.get_sentence_embedding_dimension()
        }


# Instancia global (singleton)
_rag_instance = None


def get_rag_service() -> RAGService:
    """Obtener instancia singleton de RAG"""
    global _rag_instance
    if _rag_instance is None:
        _rag_instance = RAGService(
            chroma_path=os.getenv("CHROMA_PATH", "./chroma_db")
        )
    return _rag_instance
