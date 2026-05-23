from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request, Query, Header, Depends, status
from fastapi.responses import PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import os
import json
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import shutil
import httpx

from app.rag_service import get_rag_service
from app.claude_service import get_claude_service, get_llm_service
from app.conversation_service import get_conversation_service
from app.whatsapp_service import get_whatsapp_service
from app.telegram_service import get_telegram_service
from app.auth_service import (
    authenticate_user,
    create_access_token,
    get_current_user_from_token,
    User,
    ACCESS_TOKEN_EXPIRE_MINUTES
)
from app.connection_manager import connection_manager
from app.routers import bot_router, client_router, channel_router
from app.services.user_service import get_user_service
from app.services.bot_service import get_bot_service
from app.services.client_service import get_client_service
from app.services.push_service import get_push_service
from app.models.client import ClientStatus
from app.models.push_subscription import SendNotificationRequest
from app.routers.whatsapp_webhook_router import router as whatsapp_webhook_router
from app.routers.telegram_webhook_router import router as telegram_webhook_router
from app.routers.web_chat_router import router as web_chat_router
from app.routers.pwa_router import router as pwa_router
from app.routers.public_router import router as public_router
from app.telegram_handlers import (
    handle_telegram_command,
    handle_telegram_text_message,
    handle_telegram_document,
)

app = FastAPI(
    title="WhatsApp RAG Bot con Claude API",
    description="Chatbot de WhatsApp con RAG (Retrieval-Augmented Generation) y Claude API",
    version="0.1.0"
)

# Configuración CORS para permitir frontend
origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== ROUTERS ADICIONALES ====================

# Incluir routers de bots, clients y channels
app.include_router(bot_router)
app.include_router(client_router)
app.include_router(channel_router)
app.include_router(whatsapp_webhook_router)  # Webhooks de WhatsApp multi-proveedor
app.include_router(telegram_webhook_router)  # Webhooks de Telegram por canal
app.include_router(web_chat_router)          # QR code + WebSocket chat web
app.include_router(pwa_router)               # PWA Push Notifications (VAPID)
app.include_router(public_router)            # Endpoints públicos sin JWT

# ==================== SEGURIDAD Y AUTENTICACIÓN ====================

# Esquema de seguridad HTTP Bearer
security = HTTPBearer()

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> User:
    """
    Dependency para obtener el usuario actual desde el token JWT

    Args:
        credentials: Credenciales HTTP Bearer (token JWT)

    Returns:
        Usuario actual

    Raises:
        HTTPException: Si el token es inválido o el usuario no existe
    """
    token = credentials.credentials

    # Verificar token
    user = await get_current_user_from_token(token)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user

# ==================== MODELOS ====================

class DocumentUpload(BaseModel):
    title: str
    category: Optional[str] = "general"

class TextDocument(BaseModel):
    title: str
    text: str
    category: Optional[str] = "general"

class TestRAGQuery(BaseModel):
    query: str
    n_results: Optional[int] = 3

class ChatRequest(BaseModel):
    message: str
    user_id: Optional[str] = "anonymous"
    use_rag: Optional[bool] = True
    max_tokens: Optional[int] = 1024
    save_conversation: Optional[bool] = True

class WhatsAppMessage(BaseModel):
    to_number: str
    message: str
    preview_url: Optional[bool] = False

class WhatsAppTemplateMessage(BaseModel):
    to_number: str
    template_name: str
    language_code: Optional[str] = "es"
    parameters: Optional[list] = None

class TelegramMessage(BaseModel):
    chat_id: int
    text: str
    parse_mode: Optional[str] = "Markdown"

# ==================== ENDPOINTS BÁSICOS ====================

@app.get("/")
async def root():
    """Endpoint raíz"""
    return {
        "message": "WhatsApp RAG Bot API",
        "status": "running",
        "version": "0.1.0"
    }

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "whatsapp-rag-bot",
        "version": "0.1.0"
    }

# ==================== ENDPOINTS DE AUTENTICACIÓN ====================

@app.post("/api/auth/login", response_model=Dict[str, Any])
async def login(
    username: str = Form(...),
    password: str = Form(...)
):
    """
    Endpoint de login para obtener token JWT

    Args:
        username: Nombre de usuario
        password: Password

    Returns:
        Token de acceso y datos del usuario

    Raises:
        HTTPException: Si las credenciales son incorrectas
    """
    # Autenticar usuario
    user = await authenticate_user(username, password)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Crear token de acceso
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username},
        expires_delta=access_token_expires
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "username": user.username,
            "email": user.email
        }
    }

@app.get("/api/auth/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """
    Obtener información del usuario actual autenticado

    Args:
        current_user: Usuario actual (inyectado por dependency)

    Returns:
        Datos del usuario actual
    """
    return {
        "username": current_user.username,
        "email": current_user.email
    }


@app.post("/api/auth/register", response_model=Dict[str, Any])
async def register(
    username: str = Form(...),
    password: str = Form(...),
    email: Optional[str] = Form(None)
):
    """
    Registrar un nuevo usuario en el sistema

    Args:
        username: Nombre de usuario único
        password: Contraseña
        email: Email opcional

    Returns:
        Datos del usuario creado

    Raises:
        HTTPException: Si el username ya existe
    """
    user_service = get_user_service()

    try:
        user = await user_service.create_user(username, password, email)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

    return {
        "success": True,
        "message": "Usuario creado exitosamente",
        "user": {
            "username": user.username,
            "email": user.email
        }
    }

# ==================== ENDPOINTS RAG ====================

@app.get("/api/documents")
async def list_documents(
    current_user: User = Depends(get_current_user)
):
    """Listar todos los documentos en la base de conocimiento"""
    try:
        rag = get_rag_service()
        documents = rag.list_documents()
        return {"success": True, "documents": documents, "total": len(documents)}
    except Exception as e:
        raise HTTPException(500, f"Error listando documentos: {str(e)}")


@app.post("/api/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(""),
    category: str = Form("general"),
    current_user: User = Depends(get_current_user)
):
    """Upload y procesar documento para RAG"""
    import uuid as _uuid

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

        chunks_created = 0
        if file.filename.endswith('.pdf'):
            chunks_created = rag.add_pdf(file_path, metadata=metadata, doc_id=doc_id)
        elif file.filename.endswith('.docx'):
            chunks_created = rag.add_docx(file_path, metadata=metadata, doc_id=doc_id)
        elif file.filename.endswith('.txt'):
            chunks_created = rag.add_text_file(file_path, metadata=metadata, doc_id=doc_id)
        else:
            raise HTTPException(400, "Formato no soportado. Usa PDF, DOCX o TXT")

        return {
            "success": True,
            "doc_id": doc_id,
            "filename": file.filename,
            "chunks_created": chunks_created,
            "message": f"Documento procesado: {chunks_created} chunks creados"
        }

    except HTTPException:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(500, f"Error procesando documento: {str(e)}")


@app.delete("/api/documents/{doc_id}")
async def delete_document(
    doc_id: str,
    current_user: User = Depends(get_current_user)
):
    """Eliminar un documento de la base de conocimiento por doc_id"""
    try:
        rag = get_rag_service()
        deleted_chunks = rag.delete_document(doc_id)
        if deleted_chunks == 0:
            raise HTTPException(404, f"Documento {doc_id} no encontrado")
        return {
            "success": True,
            "doc_id": doc_id,
            "deleted_chunks": deleted_chunks,
            "message": f"Documento eliminado: {deleted_chunks} chunks borrados"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Error eliminando documento: {str(e)}")

@app.post("/api/documents/text")
async def add_text_document(doc: TextDocument):
    """Agregar documento de texto directamente"""

    try:
        rag = get_rag_service()

        chunks_created = rag.add_document(
            text=doc.text,
            metadata={
                "title": doc.title,
                "category": doc.category,
                "source": "direct_input"
            }
        )

        return {
            "success": True,
            "title": doc.title,
            "chunks_created": chunks_created,
            "message": f"Documento agregado: {chunks_created} chunks creados"
        }

    except Exception as e:
        raise HTTPException(500, f"Error: {str(e)}")

@app.post("/api/rag/search")
async def search_documents(query: TestRAGQuery):
    """Buscar documentos relevantes (para testing)"""

    try:
        rag = get_rag_service()
        docs = rag.search(query.query, n_results=query.n_results)

        return {
            "query": query.query,
            "results_count": len(docs),
            "documents": docs
        }

    except Exception as e:
        raise HTTPException(500, f"Error en búsqueda: {str(e)}")

@app.post("/api/rag/context")
async def get_context(query: TestRAGQuery):
    """Obtener contexto formateado para LLM (para testing)"""

    try:
        rag = get_rag_service()
        context = rag.get_context(query.query, n_results=query.n_results)

        return {
            "query": query.query,
            "context": context,
            "context_length": len(context),
            "estimated_tokens": len(context) // 4
        }

    except Exception as e:
        raise HTTPException(500, f"Error obteniendo contexto: {str(e)}")

@app.get("/api/rag/stats")
async def get_rag_stats():
    """Obtener estadísticas de la base de conocimiento"""

    try:
        rag = get_rag_service()
        stats = rag.get_stats()

        return {
            "success": True,
            "stats": stats
        }

    except Exception as e:
        raise HTTPException(500, f"Error obteniendo stats: {str(e)}")

@app.delete("/api/rag/clear")
async def clear_knowledge_base():
    """Limpiar toda la base de conocimiento (CUIDADO!)"""

    try:
        rag = get_rag_service()
        rag.clear_collection()

        return {
            "success": True,
            "message": "Base de conocimiento limpiada completamente"
        }

    except Exception as e:
        raise HTTPException(500, f"Error limpiando base: {str(e)}")

# ==================== ENDPOINTS CHAT ====================

@app.post("/api/chat")
async def chat(request: ChatRequest):
    """
    Endpoint principal de chat con Claude + RAG

    Flujo:
    1. Recibe mensaje del usuario
    2. Si use_rag=True, busca contexto relevante en la base de conocimiento
    3. Genera respuesta con Claude usando el contexto
    4. Retorna respuesta con metadatos (tokens, costo, etc.)
    """

    try:
        # Obtener servicios
        claude = get_llm_service()

        # Buscar contexto RAG si está habilitado
        rag_context = None
        if request.use_rag:
            try:
                rag = get_rag_service()
                rag_context = rag.get_context(request.message, n_results=3)
                print(f"📚 Contexto RAG recuperado: {len(rag_context)} caracteres")
            except Exception as e:
                print(f"⚠️  Error obteniendo contexto RAG: {e}")
                # Continuar sin RAG si falla
                rag_context = None

        # Generar respuesta con Claude
        response = await claude.generate_rag_response(
            user_message=request.message,
            rag_context=rag_context if rag_context else "",
            max_tokens=request.max_tokens
        )

        # Guardar conversación en MongoDB
        conversation_info = None
        if request.save_conversation:
            try:
                conv_service = get_conversation_service()
                conversation_info = await conv_service.log_chat_interaction(
                    user_id=request.user_id,
                    user_message=request.message,
                    assistant_response=response.response,
                    metadata={
                        "model": response.model,
                        "tokens_used": response.tokens_used,
                        "input_tokens": response.input_tokens,
                        "output_tokens": response.output_tokens,
                        "estimated_cost_usd": response.estimated_cost_usd,
                        "rag_used": request.use_rag and rag_context is not None,
                        "context_length": len(rag_context) if rag_context else 0
                    }
                )
                print(f"💾 Conversación guardada: {conversation_info['conversation_id']}")
            except Exception as e:
                print(f"⚠️  Error guardando conversación: {e}")
                # No fallar si el guardado falla

        return {
            "success": True,
            "message": request.message,
            "response": response.response,
            "metadata": {
                "model": response.model,
                "tokens_used": response.tokens_used,
                "input_tokens": response.input_tokens,
                "output_tokens": response.output_tokens,
                "estimated_cost_usd": round(response.estimated_cost_usd, 6),
                "timestamp": response.timestamp,
                "rag_used": request.use_rag and rag_context is not None,
                "context_length": len(rag_context) if rag_context else 0,
                "conversation_id": conversation_info["conversation_id"] if conversation_info else None
            }
        }

    except ValueError as e:
        # Error de configuración (API key no configurada)
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error generando respuesta: {str(e)}"
        )

# ==================== ENDPOINTS DE CLIENTES (GLOBAL) ====================

@app.get("/api/clients")
async def get_all_clients(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[ClientStatus] = Query(None),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user)
):
    """
    Obtiene todos los clientes pertenecientes a los bots del usuario autenticado.
    """
    try:
        bot_service = get_bot_service()
        bots_result = await bot_service.get_bots_by_owner(
            owner_id=current_user.username, skip=0, limit=1000
        )
        bot_ids = [b.bot_id for b in bots_result["bots"]]

        client_service = get_client_service()
        skip = (page - 1) * limit
        result = await client_service.get_clients_by_bot_ids(
            bot_ids=bot_ids,
            skip=skip,
            limit=limit,
            status=status,
            search=search
        )

        return {
            "success": True,
            "clients": [c.model_dump() for c in result["clients"]],
            "total": result["total"],
            "page": result["page"],
            "pages": result["pages"],
            "limit": result["limit"]
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error obteniendo clientes: {str(e)}"
        )

# ==================== ENDPOINTS DE CONVERSACIONES ====================

@app.get("/api/conversations")
async def get_conversations(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user_id: Optional[str] = Query(None),
    platform: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    sort_by: str = Query("updated_at"),
    order: str = Query("desc"),
    current_user: User = Depends(get_current_user)
):
    """
    Obtiene lista de conversaciones con paginación y filtros (requiere autenticación)

    Args:
        page: Número de página (1-indexed)
        limit: Cantidad de resultados por página (1-100)
        user_id: Filtrar por user_id específico
        platform: Filtrar por plataforma (whatsapp, telegram)
        date_from: Fecha inicial (ISO format)
        date_to: Fecha final (ISO format)
        search: Buscar en user_id o contenido
        sort_by: Campo para ordenar (updated_at, created_at, total_tokens_used)
        order: Orden (asc, desc)
        current_user: Usuario autenticado (inyectado automáticamente)

    Returns:
        Lista de conversaciones con metadata de paginación
    """
    try:
        conv_service = get_conversation_service()

        # Obtener bot_ids del usuario autenticado para filtrar sus conversaciones
        bot_service = get_bot_service()
        bots_result = await bot_service.get_bots_by_owner(
            owner_id=current_user.username, skip=0, limit=1000
        )
        owner_bot_ids = [b.bot_id for b in bots_result["bots"]]

        # Calcular skip para paginación
        skip = (page - 1) * limit

        result = await conv_service.get_all_conversations(
            skip=skip,
            limit=limit,
            user_id=user_id,
            platform=platform,
            date_from=date_from,
            date_to=date_to,
            search=search,
            sort_by=sort_by,
            order=order,
            bot_ids=owner_bot_ids
        )

        return {
            "success": True,
            **result
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error obteniendo conversaciones: {str(e)}"
        )

@app.get("/api/conversations/stats/timeline")
async def get_timeline_stats(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user)
):
    """
    Obtiene estadísticas por día para un período de tiempo (requiere autenticación)

    Args:
        days: Número de días hacia atrás (1-365)
        current_user: Usuario autenticado (inyectado automáticamente)

    Returns:
        Timeline con estadísticas diarias (conversaciones, mensajes, tokens, costo)
    """
    try:
        conv_service = get_conversation_service()

        bot_service = get_bot_service()
        bots_result = await bot_service.get_bots_by_owner(
            owner_id=current_user.username, skip=0, limit=1000
        )
        owner_bot_ids = [b.bot_id for b in bots_result["bots"]]

        timeline = await conv_service.get_timeline_stats(days=days, bot_ids=owner_bot_ids)

        return {
            "success": True,
            **timeline
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error obteniendo timeline: {str(e)}"
        )

@app.get("/api/conversations/stats")
async def get_conversation_stats(
    current_user: User = Depends(get_current_user)
):
    """
    Obtiene estadísticas generales de conversaciones (requiere autenticación)

    Retorna métricas de uso:
    - Total de conversaciones
    - Total de mensajes
    - Tokens usados
    - Costo total
    - Usuarios activos
    - Conversaciones por plataforma
    """
    try:
        conv_service = get_conversation_service()

        bot_service = get_bot_service()
        bots_result = await bot_service.get_bots_by_owner(
            owner_id=current_user.username, skip=0, limit=1000
        )
        owner_bot_ids = [b.bot_id for b in bots_result["bots"]]

        stats = await conv_service.get_conversation_stats(bot_ids=owner_bot_ids)

        return {
            "success": True,
            "stats": stats
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error obteniendo estadísticas: {str(e)}"
        )

@app.get("/api/conversations/{conversation_id}")
async def get_conversation_by_id(
    conversation_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Obtiene una conversación específica por ID (requiere autenticación)

    Args:
        conversation_id: ID de la conversación
        current_user: Usuario autenticado (inyectado automáticamente)

    Returns:
        Conversación completa con todos los mensajes
    """
    try:
        conv_service = get_conversation_service()
        conversation = await conv_service.get_conversation(conversation_id)

        if not conversation:
            raise HTTPException(
                status_code=404,
                detail=f"Conversación {conversation_id} no encontrada"
            )

        # Validar que la conversación pertenece a un bot del usuario autenticado
        conv_bot_id = conversation.get("bot_id")
        if conv_bot_id:
            bot_service = get_bot_service()
            owner_bot = await bot_service.get_bot_by_owner(conv_bot_id, current_user.username)
            if not owner_bot:
                raise HTTPException(
                    status_code=404,
                    detail=f"Conversación {conversation_id} no encontrada"
                )

        return {
            "success": True,
            "conversation": conversation
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error obteniendo conversación: {str(e)}"
        )


class AgentMessageRequest(BaseModel):
    content: str


@app.post("/api/conversations/{conversation_id}/agent-message")
async def send_agent_message(
    conversation_id: str,
    body: AgentMessageRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Envía un mensaje de agente humano a una conversación existente.
    El mensaje se almacena con role='assistant' y metadata.source='agent'.
    """
    try:
        conv_service = get_conversation_service()
        conversation = await conv_service.get_conversation(conversation_id)

        if not conversation:
            raise HTTPException(status_code=404, detail="Conversación no encontrada")

        # Validar que la conversación pertenece a un bot del usuario autenticado
        conv_bot_id = conversation.get("bot_id")
        if conv_bot_id:
            bot_service = get_bot_service()
            owner_bot = await bot_service.get_bot_by_owner(conv_bot_id, current_user.username)
            if not owner_bot:
                raise HTTPException(status_code=404, detail="Conversación no encontrada")

        msg = await conv_service.add_message(
            conversation_id=conversation_id,
            role="assistant",
            content=body.content,
            metadata={"source": "agent", "agent_username": current_user.username},
        )

        # Empujar el mensaje al cliente si tiene conexión WebSocket activa
        delivered = await connection_manager.send_to_conversation(
            conversation_id,
            {
                "type": "message",
                "role": "assistant",
                "content": body.content,
                "metadata": {"source": "agent"},
            },
        )

        # Enviar push notification
        conv_bot_id = conversation.get("bot_id")
        conv_channel_id = (conversation.get("metadata") or {}).get("channel_id")
        push_result = {"sent": 0, "failed": 0, "debug_bot_id": conv_bot_id, "debug_channel_id": conv_channel_id}
        if conv_bot_id:
            try:
                push_service = get_push_service()
                preview = body.content if len(body.content) <= 80 else body.content[:77] + "…"
                # Construir URL de destino: preferir canal, fallback bot
                if conv_channel_id:
                    chat_url = f"/chat/c/{conv_channel_id}"
                else:
                    chat_url = f"/chat/{conv_bot_id}"

                result = await push_service.broadcast_to_bot(
                    bot_id=conv_bot_id,
                    request=SendNotificationRequest(
                        title="Tienes un nuevo mensaje",
                        body=preview,
                        url=chat_url,
                        channel_id=conv_channel_id,
                    ),
                )
                push_result = {"sent": result.sent, "failed": result.failed, "errors": result.errors, "channel_id": conv_channel_id, "bot_id": conv_bot_id, "url": chat_url}
            except Exception as e:
                import traceback as tb
                push_result = {"error": str(e), "trace": tb.format_exc(), "debug_bot_id": conv_bot_id, "debug_channel_id": conv_channel_id}

        return {"success": True, "message": msg, "delivered": delivered, "push": push_result}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error enviando mensaje: {str(e)}")


# ==================== ENDPOINTS WHATSAPP ====================

@app.get("/api/webhook", response_class=PlainTextResponse)
async def verify_webhook(
    request: Request
):
    """
    Webhook verification endpoint for WhatsApp

    WhatsApp will call this endpoint to verify the webhook
    """
    whatsapp = get_whatsapp_service()

    # Get query parameters manually (FastAPI has issues with dots in param names)
    mode = request.query_params.get("hub.mode", "")
    token = request.query_params.get("hub.verify_token", "")
    challenge = request.query_params.get("hub.challenge", "")

    result = whatsapp.verify_webhook(mode, token, challenge)

    if result:
        return result
    else:
        raise HTTPException(status_code=403, detail="Verification failed")


@app.post("/api/webhook")
async def handle_webhook(
    request: Request,
    x_hub_signature: Optional[str] = Header(None, alias="X-Hub-Signature-256")
):
    """
    Webhook endpoint to receive WhatsApp messages

    Handles incoming messages and processes them with Claude + RAG
    """
    try:
        whatsapp = get_whatsapp_service()

        # Get raw body for signature verification
        body = await request.body()
        body_str = body.decode()

        # Verify signature (if configured) - TEMPORARILY DISABLED FOR TESTING
        # TODO: Fix WHATSAPP_APP_SECRET and re-enable signature verification
        # if not whatsapp.verify_signature(body_str, x_hub_signature or ""):
        #     raise HTTPException(status_code=403, detail="Invalid signature")

        # Parse JSON
        webhook_data = json.loads(body_str)

        # DEBUG: Log received data
        print(f"🔍 DEBUG: Webhook data received: {json.dumps(webhook_data, indent=2)}")

        # Parse message
        message_data = whatsapp.parse_message(webhook_data)

        # DEBUG: Log parsed message
        print(f"🔍 DEBUG: Parsed message data: {message_data}")

        if not message_data:
            # Not a message event (could be status update, etc.)
            return {"status": "ok", "message": "Event received but not a message"}

        # Check for duplicate (idempotency)
        if whatsapp.is_duplicate_message(message_data["message_id"]):
            return {"status": "ok", "message": "Duplicate message, already processed"}

        # Check rate limit
        if whatsapp.check_rate_limit(message_data["from_number"]):
            # Send rate limit message
            await whatsapp.send_message(
                to_number=message_data["from_number"],
                message="Has excedido el límite de mensajes. Por favor, espera un momento antes de enviar más mensajes."
            )
            return {"status": "ok", "message": "Rate limit exceeded"}

        # Only process text messages for now
        if message_data["type"] != "text" or not message_data["text"]:
            await whatsapp.send_message(
                to_number=message_data["from_number"],
                message="Por el momento solo puedo procesar mensajes de texto."
            )
            return {"status": "ok", "message": "Non-text message"}

        # Mark message as read
        await whatsapp.mark_message_as_read(message_data["message_id"])

        # Process message with Claude + RAG
        try:
            # Get services
            claude = get_llm_service()
            rag = get_rag_service()

            # Get RAG context
            rag_context = rag.get_context(message_data["text"], n_results=3)

            # Generate response with Claude
            response = await claude.generate_rag_response(
                user_message=message_data["text"],
                rag_context=rag_context,
                max_tokens=1024
            )

            # Send response back to WhatsApp
            await whatsapp.send_message(
                to_number=message_data["from_number"],
                message=response.response
            )

            # Save conversation to MongoDB
            try:
                conv_service = get_conversation_service()
                await conv_service.log_chat_interaction(
                    user_id=message_data["from_number"],
                    user_message=message_data["text"],
                    assistant_response=response.response,
                    metadata={
                        "model": response.model,
                        "tokens_used": response.tokens_used,
                        "input_tokens": response.input_tokens,
                        "output_tokens": response.output_tokens,
                        "estimated_cost_usd": response.estimated_cost_usd,
                        "rag_used": True,
                        "context_length": len(rag_context),
                        "whatsapp_message_id": message_data["message_id"],
                        "source": "whatsapp"
                    }
                )
            except Exception as e:
                print(f"⚠️ Error saving conversation: {e}")

            return {
                "status": "ok",
                "message": "Message processed successfully",
                "tokens_used": response.tokens_used,
                "cost_usd": response.estimated_cost_usd
            }

        except Exception as e:
            # Send error message to user
            await whatsapp.send_message(
                to_number=message_data["from_number"],
                message="Lo siento, ocurrió un error al procesar tu mensaje. Por favor intenta de nuevo."
            )
            raise e

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error processing webhook: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error processing webhook: {str(e)}"
        )


@app.post("/api/whatsapp/send")
async def send_whatsapp_message(message: WhatsAppMessage):
    """
    Send a message via WhatsApp Business API

    For testing and manual message sending
    """
    try:
        whatsapp = get_whatsapp_service()

        result = await whatsapp.send_message(
            to_number=message.to_number,
            message=message.message,
            preview_url=message.preview_url
        )

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error sending message: {str(e)}"
        )


@app.post("/api/whatsapp/send-template")
async def send_whatsapp_template(template: WhatsAppTemplateMessage):
    """
    Send a template message via WhatsApp Business API

    Templates must be pre-approved in WhatsApp Business Manager
    """
    try:
        whatsapp = get_whatsapp_service()

        result = await whatsapp.send_template_message(
            to_number=template.to_number,
            template_name=template.template_name,
            language_code=template.language_code,
            parameters=template.parameters
        )

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error sending template: {str(e)}"
        )


@app.get("/api/whatsapp/rate-limit/{phone_number}")
async def get_rate_limit_info(phone_number: str):
    """
    Get rate limit information for a phone number
    """
    whatsapp = get_whatsapp_service()
    info = whatsapp.get_rate_limit_info(phone_number)

    return {
        "success": True,
        "phone_number": phone_number,
        "rate_limit": info
    }

# ==================== ENDPOINTS TELEGRAM ====================

@app.post("/api/webhook/telegram")
async def handle_telegram_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: Optional[str] = Header(None, alias="X-Telegram-Bot-Api-Secret-Token")
):
    """
    Webhook endpoint to receive Telegram updates

    Handles:
    - Text messages → Process with Claude + RAG
    - Commands: /start, /help, /stats
    - Documents (PDF/DOCX) → Add to RAG database
    """
    try:
        telegram = get_telegram_service()

        # Verify webhook secret
        if not telegram.verify_webhook(x_telegram_bot_api_secret_token):
            raise HTTPException(status_code=403, detail="Invalid secret token")

        # Parse JSON body
        body = await request.body()
        update_data = json.loads(body.decode())

        # DEBUG: Log received data
        print(f"🔍 DEBUG: Telegram update received: {json.dumps(update_data, indent=2)}")

        # Parse message
        message_data = telegram.parse_message(update_data)

        if not message_data:
            return {"status": "ok", "message": "Not a message update"}

        # Check for duplicate (idempotency)
        if telegram.is_duplicate_message(message_data["update_id"]):
            return {"status": "ok", "message": "Duplicate update, already processed"}

        # Check rate limit
        if telegram.check_rate_limit(message_data["chat_id"]):
            await telegram.send_message(
                chat_id=message_data["chat_id"],
                text="⚠️ Has excedido el límite de mensajes. Por favor, espera un momento."
            )
            return {"status": "ok", "message": "Rate limit exceeded"}

        # Handle different message types

        # 1. COMMANDS
        if message_data["type"] == "command":
            return await handle_telegram_command(telegram, message_data)

        # 2. TEXT MESSAGES
        elif message_data["type"] == "text":
            return await handle_telegram_text_message(telegram, message_data)

        # 3. DOCUMENTS
        elif message_data["type"] == "document":
            return await handle_telegram_document(telegram, message_data)

        # 4. UNSUPPORTED
        else:
            await telegram.send_message(
                chat_id=message_data["chat_id"],
                text="⚠️ Por el momento solo puedo procesar mensajes de texto y documentos (PDF/DOCX)."
            )
            return {"status": "ok", "message": "Unsupported message type"}

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error processing Telegram webhook: {e}")
        raise HTTPException(500, f"Error processing webhook: {str(e)}")


@app.get("/api/telegram/setup")
async def telegram_setup_info():
    """
    Returns Telegram bot setup information and webhook status
    """
    telegram = get_telegram_service()

    if not telegram.bot_token:
        return {
            "configured": False,
            "message": "Telegram bot not configured. Set TELEGRAM_BOT_TOKEN in .env"
        }

    # Get bot info
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{telegram.base_url}/getMe", timeout=10.0)
            bot_info = response.json()

            # Get webhook info
            webhook_response = await client.get(f"{telegram.base_url}/getWebhookInfo", timeout=10.0)
            webhook_info = webhook_response.json()

        return {
            "configured": True,
            "bot_info": bot_info.get("result", {}),
            "webhook_info": webhook_info.get("result", {}),
            "setup_instructions": {
                "step_1": "Create bot with @BotFather on Telegram",
                "step_2": "Get bot token and set TELEGRAM_BOT_TOKEN in .env",
                "step_3": "Set TELEGRAM_WEBHOOK_SECRET in .env",
                "step_4": "Set webhook URL: POST to https://api.telegram.org/bot<TOKEN>/setWebhook",
                "webhook_url_format": "https://your-domain.com/api/webhook/telegram",
                "secret_token_header": "X-Telegram-Bot-Api-Secret-Token"
            }
        }

    except Exception as e:
        return {
            "configured": True,
            "error": f"Error getting bot info: {str(e)}"
        }


@app.post("/api/telegram/send")
async def send_telegram_message(message: TelegramMessage):
    """
    Send a message via Telegram Bot API

    For testing and manual message sending
    """
    try:
        telegram = get_telegram_service()

        result = await telegram.send_message(
            chat_id=message.chat_id,
            text=message.text,
            parse_mode=message.parse_mode
        )

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Error sending message: {str(e)}")

# ==================== EVENTOS ====================

# Evento de inicio
@app.on_event("startup")
async def startup_event():
    """Inicialización de la aplicación"""
    print("=" * 50)
    print("🚀 WhatsApp RAG Bot - Iniciando...")
    print(f"⏰ Timestamp: {datetime.utcnow().isoformat()}")
    print("=" * 50)

    # Inicializar usuarios en MongoDB y crear admin por defecto
    try:
        user_service = get_user_service()
        await user_service.ensure_indexes()
        await user_service.ensure_default_admin()
        print("✅ User Service inicializado")
    except Exception as e:
        print(f"⚠️  Error inicializando User Service: {e}")

    # Inicializar RAG service
    try:
        rag = get_rag_service()
        stats = rag.get_stats()
        print("✅ RAG Service inicializado")
        print(f"📚 Base de conocimiento: {stats['total_chunks']} chunks")
        print(f"🔢 Dimensión embeddings: {stats['embedding_dimension']}")
    except Exception as e:
        print(f"⚠️  Error inicializando RAG: {e}")

    # Inicializar servicio LLM (Claude o Ollama según LLM_PROVIDER)
    try:
        get_llm_service()
        print("✅ LLM Service inicializado")
    except ValueError as e:
        print(f"⚠️  LLM no configurado: {e}")
        print("   Revisá LLM_PROVIDER y las credenciales en backend/.env")
    except Exception as e:
        print(f"⚠️  Error inicializando LLM: {e}")

    # Inicializar WhatsApp service
    try:
        whatsapp = get_whatsapp_service()
        print("✅ WhatsApp Service inicializado")
        if not whatsapp.access_token or not whatsapp.phone_number_id:
            print("⚠️  WhatsApp API no configurado completamente")
            print("   Para usar WhatsApp, configura WHATSAPP_TOKEN y WHATSAPP_PHONE_ID en backend/.env")
    except Exception as e:
        print(f"⚠️  Error inicializando WhatsApp: {e}")

    # Inicializar Telegram service
    try:
        telegram = get_telegram_service()
        print("✅ Telegram Service inicializado")
        if not telegram.bot_token:
            print("⚠️  Telegram Bot no configurado completamente")
            print("   Para usar Telegram, configura TELEGRAM_BOT_TOKEN en backend/.env")
    except Exception as e:
        print(f"⚠️  Error inicializando Telegram: {e}")

    # Inicializar Push Notification service (VAPID)
    try:
        push_service = get_push_service()
        await push_service.ensure_indexes()
        pub_key = push_service.get_vapid_public_key()
        if pub_key:
            print("✅ Push Notification Service (VAPID) inicializado")
            print(f"🔑 VAPID Public Key: {pub_key[:20]}...")
        else:
            print("⚠️  Push Notifications no configuradas (sin VAPID keys)")
            print("   Genera las claves y agrega VAPID_PRIVATE_KEY y VAPID_PUBLIC_KEY al backend/.env")
    except Exception as e:
        print(f"⚠️  Error inicializando Push Service: {e}")

    print("=" * 50)

# Evento de shutdown
@app.on_event("shutdown")
async def shutdown_event():
    """Cierre de la aplicación"""
    print("=" * 50)
    print("🛑 WhatsApp RAG Bot - Cerrando...")
    print("=" * 50)
