# MVP con RAG (Retrieval-Augmented Generation)

> **Actualización:** Este documento usa **Claude API** (cloud) en lugar de Ollama (local) para reducir costos de infraestructura y mejorar calidad. VPS mínimo: 2GB RAM vs 8GB. Costo inicial: ~$6/mes vs ~$16/mes.

## Por Qué RAG es ESENCIAL

### Problema sin RAG:
```
Usuario: "¿Cuál es el horario de atención?"
LLM solo: "Lo siento, no tengo esa información actualizada"
           ❌ Inventa horarios
           ❌ Da respuestas genéricas
           ❌ No puede acceder a tu información específica
```

### Solución con RAG:
```
Usuario: "¿Cuál es el horario de atención?"

1. Vector Search → Encuentra doc "horarios.txt"
2. Contexto: "Lunes a Viernes 9:00-18:00"
3. LLM + Contexto → "Nuestro horario es Lunes a Viernes..."
   ✅ Respuesta precisa
   ✅ Basada en tus documentos
   ✅ Actualizable sin reentrenar modelo
```

---

## Arquitectura RAG para MVP

### Componentes del Sistema RAG

```
┌─────────────────────────────────────────────┐
│  PIPELINE RAG                               │
│                                             │
│  1. INDEXACIÓN (Una vez)                    │
│     Documentos → Chunks → Embeddings        │
│     → ChromaDB (Vector Store)               │
│                                             │
│  2. RETRIEVAL (Por query)                   │
│     Query → Embedding → Vector Search       │
│     → Top K documentos relevantes           │
│                                             │
│  3. GENERATION (Por query)                  │
│     Query + Docs → Prompt → Ollama          │
│     → Respuesta fundamentada                │
└─────────────────────────────────────────────┘
```

---

## STACK RAG PARA MVP

### Componentes Necesarios

**1. Vector Database:** ChromaDB
- ✅ Open-source y gratuito
- ✅ Embebido (sin servidor adicional)
- ✅ < 100MB RAM
- ✅ Perfecto para <100K documentos

**2. Embeddings Model:** Sentence-Transformers
- ✅ Modelos pequeños (< 500MB)
- ✅ Multiidioma (español)
- ✅ CPU-friendly
- ✅ Open-source

**3. LLM:** Claude API (Claude 3.5 Haiku)
- ✅ API cloud de Anthropic
- ✅ Sin necesidad de VPS potente
- ✅ Calidad superior a modelos locales
- ✅ Pay-as-you-go ($0.80/$4.00 por 1M tokens)

**4. Chunking:** LangChain
- ✅ Librerí ligera para dividir textos
- ✅ Strategies inteligentes
- ✅ Overlap configurable

---

## DOCKER COMPOSE ACTUALIZADO

```yaml
# docker-compose.yml - CON RAG + CLAUDE API
version: '3.8'

services:
  # Aplicación FastAPI (con RAG + Claude API)
  app:
    build: ./backend
    container_name: whatsapp_rag_app
    ports:
      - "8000:8000"
    environment:
      - MONGODB_URI=mongodb://mongo:27017/whatsapp
      - REDIS_URL=redis://redis:6379
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - CHROMA_PATH=/app/chroma_db
      - WHATSAPP_TOKEN=${WHATSAPP_TOKEN}
      - WHATSAPP_PHONE_ID=${WHATSAPP_PHONE_ID}
    volumes:
      - chroma_data:/app/chroma_db
      - documents:/app/documents
    depends_on:
      - mongo
      - redis
    restart: unless-stopped

  # MongoDB (reducido para MVP)
  mongo:
    image: mongo:7
    container_name: mongo
    volumes:
      - mongo_data:/data/db
    restart: unless-stopped
    command: --wiredTigerCacheSizeGB 0.25

  # Redis (reducido para MVP)
  redis:
    image: redis:7-alpine
    container_name: redis
    command: redis-server --maxmemory 128mb
    restart: unless-stopped

  # Frontend
  frontend:
    image: nginx:alpine
    container_name: frontend
    volumes:
      - ./frontend/out:/usr/share/nginx/html
      - ./nginx.conf:/etc/nginx/nginx.conf
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - app
    restart: unless-stopped

volumes:
  mongo_data:
  chroma_data:      # Vector database
  documents:        # Documentos fuente
```

---

## CÓDIGO COMPLETO CON RAG

### 1. Requirements (backend/requirements.txt)

```txt
fastapi==0.109.0
uvicorn==0.27.0
motor==3.3.2
redis==5.0.1
httpx==0.26.0
pydantic==2.5.3

# LLM
anthropic==0.18.1

# RAG Dependencies
chromadb==0.4.22
sentence-transformers==2.3.1
langchain==0.1.4
langchain-community==0.0.13
pypdf==4.0.0
python-docx==1.1.0
```

### 2. Configuración de Claude API

**Paso 1: Obtener API Key**

1. Crear cuenta en https://console.anthropic.com
2. Ir a "API Keys"
3. Crear nueva key
4. Copiar la key (empieza con `sk-ant-...`)

**Paso 2: Configurar Variables de Entorno**

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-api03-xxx...
CLAUDE_MODEL=claude-3-5-haiku-20241022

# WhatsApp
WHATSAPP_TOKEN=your_whatsapp_token
WHATSAPP_PHONE_ID=your_phone_id

# Database
MONGODB_URI=mongodb://mongo:27017/whatsapp
REDIS_URL=redis://redis:6379
CHROMA_PATH=/app/chroma_db
```

**Paso 3: Rate Limits y Tiers**

```
Tier Free:
- 50 requests/min
- 40,000 tokens/min
- Suficiente para MVP (50-200 usuarios)

Tier 1 ($5+ gastados):
- 1,000 requests/min
- 80,000 tokens/min
- Para escalar >500 usuarios
```

**Paso 4: Monitoreo de Costos**

Agregar a tu dashboard:
```python
@app.get("/api/billing/today")
async def get_billing_today():
    """Estimar costos de Claude API hoy"""

    today_start = datetime.utcnow().replace(hour=0, minute=0)

    logs = await db.rag_logs.find({
        "timestamp": {"$gte": today_start}
    }).to_list(None)

    total_cost = sum(log.get("estimated_cost_usd", 0) for log in logs)
    total_requests = len(logs)

    return {
        "date": today_start.date().isoformat(),
        "total_requests": total_requests,
        "estimated_cost_usd": round(total_cost, 4),
        "avg_cost_per_request": round(total_cost / total_requests, 6) if total_requests > 0 else 0
    }
```

### 3. RAG Service (backend/rag_service.py)

```python
# backend/rag_service.py
import os
from typing import List, Dict
import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.docstore.document import Document
import PyPDF2
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
        print("✅ Modelo cargado")
        
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
    
    def add_pdf(self, pdf_path: str, metadata: Dict = None) -> int:
        """Agregar PDF a la base de conocimiento"""
        
        text = ""
        with open(pdf_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            for page in pdf_reader.pages:
                text += page.extract_text() + "\n\n"
        
        return self.add_document(
            text,
            metadata={
                **(metadata or {}),
                "source": pdf_path,
                "type": "pdf"
            }
        )
    
    def add_docx(self, docx_path: str, metadata: Dict = None) -> int:
        """Agregar DOCX a la base de conocimiento"""
        
        doc = DocxDocument(docx_path)
        text = "\n\n".join([para.text for para in doc.paragraphs])
        
        return self.add_document(
            text,
            metadata={
                **(metadata or {}),
                "source": docx_path,
                "type": "docx"
            }
        )
    
    def add_text_file(self, file_path: str, metadata: Dict = None) -> int:
        """Agregar archivo de texto"""
        
        with open(file_path, 'r', encoding='utf-8') as f:
            text = f.read()
        
        return self.add_document(
            text,
            metadata={
                **(metadata or {}),
                "source": file_path,
                "type": "txt"
            }
        )
    
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
            "embedding_model": self.embedder.get_sentence_embedding_dimension()
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
```

### 3. FastAPI con RAG Integrado

```python
# backend/main.py
from fastapi import FastAPI, Request, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import os
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
import redis.asyncio as redis
from typing import Optional
import shutil
import anthropic

from rag_service import get_rag_service

app = FastAPI(title="WhatsApp Business con RAG + Claude")

# ==================== CONFIGURACIÓN ====================

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-3-5-haiku-20241022")
WHATSAPP_API = "https://graph.facebook.com/v18.0"
WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN")
WHATSAPP_PHONE_ID = os.getenv("WHATSAPP_PHONE_ID")

# Conexiones
mongo_client = AsyncIOMotorClient(os.getenv("MONGODB_URI"))
db = mongo_client.whatsapp
redis_client = redis.from_url(os.getenv("REDIS_URL"))

# Claude client
claude_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

# RAG Service
rag = get_rag_service()

# ==================== MODELOS ====================

class DocumentUpload(BaseModel):
    title: str
    category: Optional[str] = "general"

# ==================== GENERACIÓN CON RAG ====================

async def generate_rag_response(query: str, phone: str) -> str:
    """Generar respuesta usando RAG + Claude API"""

    # 1. Obtener contexto de la base de conocimiento
    context = rag.get_context(
        query=query,
        n_results=3,
        max_tokens=1500  # Claude tiene mayor context window
    )

    # 2. Obtener historial de conversación
    history = await get_conversation_history(phone, limit=3)

    # 3. Construir prompt con RAG
    system_prompt = """Eres un asistente de atención al cliente profesional.

IMPORTANTE:
- Responde SOLO con información del CONTEXTO proporcionado
- Si la información no está en el CONTEXTO, di "No tengo esa información, te contacto con un agente"
- Sé conciso (máximo 3 oraciones)
- Usa un tono amable y profesional
- Cita el documento cuando sea relevante

CONTEXTO:
{context}

Si el CONTEXTO está vacío o no es relevante, admite que no sabes la respuesta."""

    # Construir mensajes para Claude
    messages = []

    # Agregar historial
    for msg in history:
        messages.append({
            "role": msg["role"],
            "content": msg["text"]
        })

    # Agregar query actual
    messages.append({
        "role": "user",
        "content": query
    })

    # 4. Generar respuesta con Claude API
    try:
        response = claude_client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=300,
            temperature=0.3,  # Baja temperatura para precisión
            system=system_prompt.format(context=context or "No hay información relevante disponible"),
            messages=messages
        )

        answer = response.content[0].text

        # Log de RAG usage con info de tokens
        await log_rag_usage(
            query=query,
            context=context,
            answer=answer,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens
        )

        return answer.strip()

    except anthropic.APIError as e:
        print(f"Error en Claude API: {e}")
        return "Disculpa, tengo problemas técnicos. Un agente te ayudará pronto."
    except Exception as e:
        print(f"Error inesperado: {e}")
        return "Disculpa, tengo problemas técnicos. Un agente te ayudará pronto."

async def log_rag_usage(
    query: str,
    context: str,
    answer: str,
    input_tokens: int,
    output_tokens: int
):
    """Log de uso de RAG para analytics y billing"""

    # Calcular costo estimado (Claude 3.5 Haiku)
    input_cost = (input_tokens / 1_000_000) * 0.80
    output_cost = (output_tokens / 1_000_000) * 4.00
    total_cost = input_cost + output_cost

    await db.rag_logs.insert_one({
        "query": query,
        "context_used": bool(context),
        "context_length": len(context) if context else 0,
        "answer": answer,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "estimated_cost_usd": total_cost,
        "model": CLAUDE_MODEL,
        "timestamp": datetime.utcnow()
    })

# ==================== WEBHOOK WHATSAPP ====================

@app.post("/webhook")
async def receive_webhook(request: Request, background_tasks: BackgroundTasks):
    """Recibir eventos de WhatsApp"""
    event = await request.json()
    background_tasks.add_task(process_whatsapp_event, event)
    return {"status": "ok"}

async def process_whatsapp_event(event: dict):
    """Procesar evento de WhatsApp"""
    
    for entry in event.get("entry", []):
        for change in entry.get("changes", []):
            if change.get("field") != "messages":
                continue
            
            for message in change["value"].get("messages", []):
                await handle_incoming_message(message)

async def handle_incoming_message(message: dict):
    """Manejar mensaje entrante CON RAG"""
    
    message_id = message["id"]
    from_number = message["from"]
    
    # Idempotencia
    if await redis_client.exists(f"msg:{message_id}"):
        return
    await redis_client.setex(f"msg:{message_id}", 86400, "1")
    
    # Extraer texto
    text = message.get("text", {}).get("body", "")
    
    # Guardar mensaje
    await db.messages.insert_one({
        "message_id": message_id,
        "from": from_number,
        "text": text,
        "timestamp": datetime.utcnow(),
        "direction": "inbound"
    })
    
    # Generar respuesta con RAG
    response = await generate_rag_response(text, from_number)
    await send_whatsapp_message(from_number, response)

async def send_whatsapp_message(to: str, text: str):
    """Enviar mensaje de WhatsApp"""
    
    url = f"{WHATSAPP_API}/{WHATSAPP_PHONE_ID}/messages"
    
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": text}
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {WHATSAPP_TOKEN}",
                "Content-Type": "application/json"
            },
            json=payload
        )
    
    result = response.json()
    
    # Guardar mensaje enviado
    if "messages" in result:
        await db.messages.insert_one({
            "to": to,
            "text": text,
            "whatsapp_message_id": result["messages"][0]["id"],
            "direction": "outbound",
            "timestamp": datetime.utcnow()
        })

async def get_conversation_history(phone: str, limit: int = 2) -> list:
    """Obtener historial de conversación"""
    
    messages = await db.messages.find(
        {"$or": [{"from": phone}, {"to": phone}]}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    history = []
    for msg in reversed(messages):
        role = "user" if msg["direction"] == "inbound" else "assistant"
        history.append({
            "role": role,
            "text": msg.get("text", "")
        })
    
    return history

# ==================== API GESTIÓN DE CONOCIMIENTO ====================

@app.post("/api/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    title: str = "",
    category: str = "general"
):
    """Upload y procesar documento para RAG"""
    
    # Guardar archivo temporalmente
    upload_dir = "/app/documents"
    os.makedirs(upload_dir, exist_ok=True)
    
    file_path = os.path.join(upload_dir, file.filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    try:
        # Procesar según tipo
        chunks_created = 0
        
        if file.filename.endswith('.pdf'):
            chunks_created = rag.add_pdf(file_path, metadata={
                "title": title or file.filename,
                "category": category
            })
        elif file.filename.endswith('.docx'):
            chunks_created = rag.add_docx(file_path, metadata={
                "title": title or file.filename,
                "category": category
            })
        elif file.filename.endswith('.txt'):
            chunks_created = rag.add_text_file(file_path, metadata={
                "title": title or file.filename,
                "category": category
            })
        else:
            raise HTTPException(400, "Formato no soportado")
        
        # Guardar metadata en MongoDB
        await db.documents.insert_one({
            "filename": file.filename,
            "title": title,
            "category": category,
            "chunks_created": chunks_created,
            "file_path": file_path,
            "uploaded_at": datetime.utcnow()
        })
        
        return {
            "success": True,
            "filename": file.filename,
            "chunks_created": chunks_created
        }
        
    except Exception as e:
        # Limpiar archivo si falla
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(500, f"Error procesando documento: {str(e)}")

@app.post("/api/documents/text")
async def add_text_document(title: str, text: str, category: str = "general"):
    """Agregar documento de texto directamente"""
    
    try:
        chunks_created = rag.add_document(
            text=text,
            metadata={
                "title": title,
                "category": category,
                "source": "direct_input"
            }
        )
        
        # Guardar en MongoDB
        await db.documents.insert_one({
            "title": title,
            "category": category,
            "text": text,
            "chunks_created": chunks_created,
            "uploaded_at": datetime.utcnow()
        })
        
        return {
            "success": True,
            "chunks_created": chunks_created
        }
        
    except Exception as e:
        raise HTTPException(500, f"Error: {str(e)}")

@app.get("/api/documents")
async def list_documents():
    """Listar documentos en la base de conocimiento"""
    
    docs = await db.documents.find().sort("uploaded_at", -1).to_list(100)
    
    return {
        "documents": docs,
        "total": len(docs),
        "rag_stats": rag.get_stats()
    }

@app.delete("/api/documents/clear")
async def clear_knowledge_base():
    """Limpiar toda la base de conocimiento (cuidado!)"""
    
    rag.clear_collection()
    await db.documents.delete_many({})
    
    return {"success": True, "message": "Base de conocimiento limpiada"}

@app.post("/api/test-rag")
async def test_rag(query: str):
    """Probar RAG con una consulta"""
    
    # Buscar documentos relevantes
    docs = rag.search(query, n_results=3)
    
    # Obtener contexto
    context = rag.get_context(query, n_results=3)
    
    # Generar respuesta
    response = await generate_rag_response(query, "test")
    
    return {
        "query": query,
        "relevant_docs": docs,
        "context_length": len(context),
        "response": response
    }

# ==================== STATS ====================

@app.get("/api/stats")
async def get_stats():
    """Estadísticas del sistema"""
    
    return {
        "messages": await db.messages.count_documents({}),
        "documents": await db.documents.count_documents({}),
        "rag_stats": rag.get_stats(),
        "rag_usage_today": await db.rag_logs.count_documents({
            "timestamp": {"$gte": datetime.utcnow().replace(hour=0, minute=0)}
        })
    }

# ==================== STARTUP ====================

@app.on_event("startup")
async def startup_event():
    """Inicializar aplicación"""
    
    # Crear índices
    await db.messages.create_index("message_id", unique=True)
    await db.documents.create_index("uploaded_at")
    await db.rag_logs.create_index("timestamp")
    
    print("✅ RAG Service inicializado")
    print(f"📚 Base de conocimiento: {rag.get_stats()}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

---

## SCRIPT DE INICIALIZACIÓN

```bash
#!/bin/bash
# init-knowledge-base.sh

# Crear directorio de documentos
mkdir -p documents

# Crear documento de ejemplo
cat > documents/info_negocio.txt << 'EOF'
INFORMACIÓN DEL NEGOCIO

Horarios de Atención:
Lunes a Viernes: 9:00 AM - 6:00 PM
Sábados: 10:00 AM - 2:00 PM
Domingos: Cerrado

Ubicación:
Av. Corrientes 1234, CABA, Argentina
Tel: +54 11 1234-5678

Servicios:
- Consultoría en tecnología
- Desarrollo de software
- Soporte técnico 24/7

Precios:
- Consulta inicial: Gratis
- Hora de desarrollo: $50 USD
- Mantenimiento mensual: desde $200 USD

Política de Devoluciones:
30 días de garantía en todos nuestros servicios.
EOF

# Upload documento usando la API
curl -X POST http://localhost:8000/api/documents/upload \
  -F "file=@documents/info_negocio.txt" \
  -F "title=Información del Negocio" \
  -F "category=empresa"

echo "✅ Base de conocimiento inicializada"
```

---

## COMPARACIÓN: SIN RAG vs CON RAG

### Escenario: Usuario pregunta sobre horarios

**SIN RAG:**
```python
Usuario: "¿Qué horario tienen?"

LLM responde basado SOLO en conocimiento general:
"Típicamente las empresas atienden de Lunes a Viernes..."
❌ Genérico
❌ Puede inventar
❌ No personalizado

Precisión: 30%
```

**CON RAG:**
```python
Usuario: "¿Qué horario tienen?"

1. Vector Search → Encuentra "horarios.txt"
2. Contexto: "Lunes a Viernes 9-18, Sábados 10-14"
3. LLM + Contexto → "Nuestro horario es Lunes a Viernes 
   de 9:00 AM a 6:00 PM, y Sábados de 10:00 AM a 2:00 PM"
✅ Preciso
✅ Basado en tus docs
✅ Actualizable

Precisión: 95%
```

---

## RECURSOS CONSUMIDOS

### Memoria Actualizada (con RAG + Claude API)

```
ChromaDB:           ~100MB (hasta 10K chunks)
Sentence-Transformers: ~400MB (modelo embeddings)
FastAPI + deps:     ~300MB
MongoDB:            ~200MB
Redis:              ~100MB
Sistema:            ~400MB

TOTAL:              ~1.5GB RAM

Recomendado: 2-4GB RAM
```

### Storage

```
Modelo embeddings:  ~400MB
ChromaDB index:     ~50-500MB (depende de docs)
Documentos fuente:  Variable

TOTAL:              ~1-2GB
```

---

## COSTOS ACTUALIZADOS CON CLAUDE API

### Precios Claude API (Claude 3.5 Haiku)

```
Input:  $0.80 / 1M tokens
Output: $4.00 / 1M tokens
Context: 200K tokens
```

### Cálculo de Costos por Escenario

**Asumiendo:**
- Prompt promedio (query + RAG context): ~800 tokens input
- Respuesta promedio: ~150 tokens output

#### Escenario 1: 50 clientes activos/mes
```
Clientes: 50
Mensajes/mes: 1,000 (20 por cliente)

Input:  1,000 × 800 = 800K tokens
        → $0.64/mes

Output: 1,000 × 150 = 150K tokens
        → $0.60/mes

Claude API: $1.24/mes
```

#### Escenario 2: 200 clientes activos/mes
```
Clientes: 200
Mensajes/mes: 5,000 (25 por cliente)

Input:  5,000 × 800 = 4M tokens
        → $3.20/mes

Output: 5,000 × 150 = 750K tokens
        → $3.00/mes

Claude API: $6.20/mes
```

#### Escenario 3: 500 clientes activos/mes
```
Clientes: 500
Mensajes/mes: 15,000 (30 por cliente)

Input:  15,000 × 800 = 12M tokens
        → $9.60/mes

Output: 15,000 × 150 = 2.25M tokens
        → $9.00/mes

Claude API: $18.60/mes
```

### Infraestructura VPS

#### Opción 1: Hetzner CPX11 (2GB RAM) - IDEAL MVP
```
Specs: 2 vCPU, 2GB RAM, 40GB SSD
Precio: €4.51/mes (~$5/mes)

Capacidad:
- 50-100 clientes
- 10K documentos indexados
- 2-3K consultas/día

PERFECTO PARA EMPEZAR
```

#### Opción 2: Hetzner CPX21 (4GB RAM) - CRECIMIENTO
```
Specs: 3 vCPU, 4GB RAM, 80GB SSD
Precio: €9.51/mes (~$10/mes)

Capacidad:
- 200-500 clientes
- 50K documentos indexados
- 10K consultas/día

PARA ESCALAR
```

### Costo Total por Escenario

| Escenario | Clientes | Mensajes/mes | VPS | Claude API | WhatsApp | **TOTAL/mes** |
|-----------|----------|--------------|-----|------------|----------|---------------|
| MVP       | 50       | 1,000        | $5  | $1.24      | $0       | **$6.24**     |
| Pequeño   | 200      | 5,000        | $5  | $6.20      | $0       | **$11.20**    |
| Mediano   | 500      | 15,000       | $10 | $18.60     | $0       | **$28.60**    |
| Grande    | 1,000    | 30,000       | $10 | $37.20     | $0       | **$47.20**    |

**Nota:** WhatsApp Business API es gratis para las primeras 1,000 conversaciones/mes

---

## CLAUDE API vs OLLAMA LOCAL

### Ventajas de Claude API

**1. Costos Operativos**
- ✅ VPS más económico: $5/mes vs $15/mes
- ✅ No necesitas GPU ni 8GB RAM
- ✅ Pay-as-you-go: Escalas costos con ingresos
- ✅ Sin costos de mantenimiento de modelos

**2. Calidad de Respuestas**
- ✅ Claude 3.5 Haiku > Llama 3.2 3B en comprensión
- ✅ Mejor manejo de español
- ✅ Context window: 200K tokens vs 8K
- ✅ Menos alucinaciones

**3. Operación**
- ✅ Sin mantenimiento de modelos
- ✅ Latencia predecible (~1-2s)
- ✅ Escalabilidad automática
- ✅ Actualizaciones de modelo sin intervención

**4. Desarrollo**
- ✅ Setup más rápido (menos dependencias)
- ✅ Debugging más simple (menos capas)
- ✅ SDK oficial con buen soporte

### Desventajas vs Ollama Local

**1. Costos Variables**
- ⚠️ A >1,000 clientes, costos API pueden superar VPS
- ⚠️ Picos de tráfico = picos de costo
- 💡 **Solución:** Migrar a Ollama cuando justifique ($40+/mes API)

**2. Dependencia Externa**
- ⚠️ Si Anthropic tiene downtime, tu bot también
- ⚠️ Rate limits de API (10K RPM en tier gratuito)
- 💡 **Solución:** Implementar fallback a respuestas pre-cargadas

**3. Privacidad**
- ⚠️ Datos pasan por servidores de Anthropic
- ⚠️ Requiere confianza en third-party
- 💡 **Solución:** Ver sección de privacidad abajo

### Consideraciones de Privacidad

**Política de Anthropic:**
- ✅ NO entrenan modelos con datos de API
- ✅ Retención: 30 días para abuse prevention
- ✅ Opción de zero data retention (Enterprise tier)
- ✅ Compliance: SOC 2 Type 2, GDPR, HIPAA (enterprise)

**Recomendaciones:**
1. **Sanitizar PII antes de enviar:**
   ```python
   # Reemplazar números de teléfono, emails, etc.
   query_sanitized = sanitize_pii(query)
   response = claude_client.messages.create(...)
   ```

2. **No enviar información sensible:**
   - ❌ Datos médicos/financieros sin sanitizar
   - ❌ Credenciales o passwords
   - ❌ Información confidencial de negocio

3. **Para casos sensibles:**
   - Considerar Ollama local
   - O usar Claude con zero data retention (Enterprise)

### Cuándo Migrar a Ollama Local

**Migrar cuando:**
- Costos API > $40-50/mes consistentemente
- Tienes >1,000 clientes activos
- Requisitos estrictos de privacidad
- Necesitas 100% uptime control

**Quedarte con Claude API cuando:**
- MVP y validación de mercado
- <500 clientes activos
- Costos API < $30/mes
- Quieres simplicidad operativa

---

## TIPOS DE DOCUMENTOS SOPORTADOS

### Formatos

✅ **PDF** - Catálogos, manuales, reportes
✅ **DOCX** - Políticas, procedimientos
✅ **TXT/MD** - FAQs, información general
✅ **CSV** (opcional) - Tablas de precios, inventarios

### Ejemplos de Documentos Útiles

**1. FAQs**
```txt
P: ¿Cuánto cuesta el servicio?
R: Nuestros precios varían según el plan...

P: ¿Hacen envíos?
R: Sí, realizamos envíos a todo el país...
```

**2. Catálogo de Productos**
```txt
Producto: Laptop XYZ
Precio: $1,200
Características: 16GB RAM, 512GB SSD...
Stock: Disponible
```

**3. Políticas de la Empresa**
```txt
POLÍTICA DE DEVOLUCIONES

Los clientes tienen 30 días para...
```

**4. Información de Contacto**
```txt
CONTACTO

Email: info@empresa.com
Teléfono: +54 11...
Horario: Lunes a Viernes...
```

---

## ESTRATEGIA DE CONTENIDO

### Prioridad 1 (Día 1):
- ✅ Horarios de atención
- ✅ Ubicación y contacto
- ✅ Productos/servicios principales
- ✅ Precios básicos
- ✅ FAQs top 10

### Prioridad 2 (Semana 1):
- Políticas (devoluciones, garantías)
- Proceso de compra/contratación
- Formas de pago
- Tiempos de entrega

### Prioridad 3 (Mes 1):
- Catálogo completo de productos
- Guías de uso
- Casos de éxito
- Promociones vigentes

---

## MÉTRICAS DE ÉXITO RAG

### Medir:

1. **Tasa de Respuesta Correcta**
```sql
SELECT 
  COUNT(*) FILTER (WHERE answer_useful = true) * 100.0 / COUNT(*) 
  AS accuracy_rate
FROM rag_logs
```

2. **Cobertura de Conocimiento**
```python
queries_with_context = consultas donde context != ""
coverage = queries_with_context / total_queries * 100
```

3. **Fallback Rate**
```python
responses_with_no_info = "No tengo esa información"
fallback_rate = responses_with_no_info / total * 100

Target: <20%
```

4. **Latencia de Retrieval**
```python
avg_retrieval_time < 100ms
avg_total_response_time < 3s
```

---

## MEJORAS FUTURAS

### Cuando tengas >100 clientes:

**1. Hybrid Search**
- Vector search + keyword search (BM25)
- Mejor precisión en nombres propios

**2. Re-ranking**
- Modelo adicional para ordenar resultados
- Elimina documentos irrelevantes

**3. Query Expansion**
- Reformular query automáticamente
- Sinónimos y variaciones

**4. Metadata Filtering**
- Filtrar por categoría, fecha, idioma
- Context más relevante

### Cuando tengas >500 clientes:

**1. Fine-tuning del modelo**
- Entrenar con tus propias conversaciones
- Mejor adaptación a tu dominio

**2. Graph RAG**
- Conocimiento estructurado como grafos
- Mejor para relaciones complejas

**3. Multi-modal RAG**
- Soporte para imágenes de productos
- Búsqueda visual

---

## RESUMEN EJECUTIVO

### ¿Por qué RAG es CRÍTICO?

**Sin RAG:**
- ❌ LLM inventa información
- ❌ No conoce TUS productos/servicios
- ❌ Información desactualizada
- ❌ Respuestas genéricas

**Con RAG:**
- ✅ Respuestas basadas en TUS documentos
- ✅ Información actualizable sin reentrenar
- ✅ Precisión 95%+ en FAQs
- ✅ Trazabilidad (cita fuentes)

### Componentes Esenciales:

```
1. ChromaDB (Vector Store) - 100MB RAM
2. Sentence-Transformers (Embeddings) - 400MB RAM
3. Claude API (LLM) - $0.80/$4.00 por 1M tokens
4. FastAPI (Orquestación) - 300MB RAM

TOTAL: 2GB RAM mínimo
```

### Costo Total:

```
VPS 2GB: $5/mes (Hetzner CPX11)
Claude API: $1-20/mes (según volumen)
WhatsApp API: $0/mes (1K conversaciones gratis)
Dominio: $1/mes

TOTAL INICIAL: $6-8/mes (50 clientes)
TOTAL ESCALADO: $30-50/mes (500-1000 clientes)

Capacidad: Escala según tráfico, no según infraestructura
```

### Precisión Esperada:

- **Preguntas en knowledge base:** 90-95%
- **Preguntas parcialmente cubiertas:** 70-80%
- **Preguntas fuera de scope:** Fallback a agente (20%)

**Conclusión:** RAG es INDISPENSABLE para un chatbot útil. Sin él, solo tienes un asistente genérico que inventa respuestas. Usar Claude API reduce costos de infraestructura y mejora la calidad vs modelos locales pequeños.
