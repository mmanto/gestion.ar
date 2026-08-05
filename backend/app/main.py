from fastapi import FastAPI, HTTPException, Form, Request, Query, Header, Depends, status
from fastapi.responses import PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import os
import json
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Literal
import httpx

from app.rag_service import get_rag_service
from app.claude_service import get_claude_service, get_llm_service
from app.conversation_service import get_conversation_service
from app.services.conversation_summary_service import generate_summary_and_update_client
from app.whatsapp_service import get_whatsapp_service
from app.telegram_service import get_telegram_service
from app.auth_service import (
    authenticate_user,
    create_access_token,
    User,
    ACCESS_TOKEN_EXPIRE_MINUTES
)
from app.dependencies.auth import get_current_user
from app.connection_manager import connection_manager, staff_connection_manager
from app.routers import bot_router, client_router, channel_router
from app.services.user_service import get_user_service
from app.services.tenant_service import get_tenant_service
from app.models.tenant import TenantStatus
from app.services.bot_service import get_bot_service
from app.services.client_service import get_client_service
from app.services.channel_service import get_channel_service
from app.services.push_service import get_push_service
from app.models.client import ClientStatus
from app.models.push_subscription import SendNotificationRequest
from app.routers.whatsapp_webhook_router import router as whatsapp_webhook_router
from app.routers.telegram_webhook_router import router as telegram_webhook_router
from app.routers.web_chat_router import router as web_chat_router
from app.routers.staff_chat_router import router as staff_chat_router
from app.routers.pwa_router import router as pwa_router
from app.routers.public_router import router as public_router
from app.routers.google_oauth_router import router as google_oauth_router
from app.routers.tenant_oauth_router import router as tenant_oauth_router
from app.module_registry import MODULE_REGISTRY
from app.routers.tenant_admin_router import router as tenant_admin_router
from app.routers.tenant_router import router as tenant_router
from app.routers.tenant_appointments_router import router as tenant_appointments_router
from app.routers.upload_router import router as upload_router, UPLOADS_DIR
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
app.include_router(staff_chat_router)          # WebSocket chat staff (agentes)
app.include_router(web_chat_router)          # QR code + WebSocket chat web
app.include_router(pwa_router)               # PWA Push Notifications (VAPID)
app.include_router(public_router)            # Endpoints públicos sin JWT
app.include_router(google_oauth_router)      # Login/conexión OAuth (Google/Microsoft) vía Nango
app.include_router(tenant_oauth_router)      # Login/alta self-service OAuth de usuarios de tenant

# Routers de módulos first-party (ver ADR-008, docs/dev/DECISIONS.md y
# app/module_registry.py) — el gating por entitlement pasa a nivel de
# request (require_module_available), no acá.
for _module_def in MODULE_REGISTRY:
    app.include_router(_module_def.router)

app.include_router(tenant_admin_router)      # Administración general: tenants, usuarios, módulos
app.include_router(tenant_router)            # Backoffice de tenant: bots (read-only), módulos, entrenamiento
app.include_router(tenant_appointments_router)  # Backoffice de tenant: calendario de turnos (scoped por tenant, ver docstring)
app.include_router(upload_router)            # Subida de archivos (avatares)

# Sirve los archivos subidos (avatares) bajo /api/uploads/* — mismo prefijo
# /api que ya proxean nginx (frontend/frontend-tenant) y Traefik en prod, así
# que las URLs relativas devueltas por upload_router funcionan sin CORS ni
# configuración de proxy adicional.
os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/api/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

# ==================== MODELOS ====================

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
        data={"sub": user.username, "tenant_id": user.tenant_id, "role": user.role},
        expires_delta=access_token_expires
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "username": user.username,
            "email": user.email,
            "nombre": user.nombre,
            "apellido": user.apellido,
            "avatar_url": user.avatar_url,
            "tenant_id": user.tenant_id,
            "role": user.role,
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
        "email": current_user.email,
        "nombre": current_user.nombre,
        "apellido": current_user.apellido,
        "avatar_url": current_user.avatar_url,
        "tenant_id": current_user.tenant_id,
        "role": current_user.role,
    }


class ProfileUpdateRequest(BaseModel):
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    avatar_url: Optional[str] = None


@app.patch("/api/auth/me")
async def update_me(
    data: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Actualiza nombre/apellido/avatar del propio usuario autenticado
    (a diferencia de rol/estado, que solo puede fijarlos administración
    general vía /api/admin/users).
    """
    from app.services.user_service import get_user_service
    user_service = get_user_service()
    updated = await user_service.update_own_profile(
        username=current_user.username,
        nombre=data.nombre,
        apellido=data.apellido,
        avatar_url=data.avatar_url,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    return {
        "username": updated.username,
        "email": updated.email,
        "nombre": updated.nombre,
        "apellido": updated.apellido,
        "avatar_url": updated.avatar_url,
        "tenant_id": updated.tenant_id,
        "role": updated.role,
    }


class RegisterRequest(BaseModel):
    """Datos del autoregistro público (flujo "Crea tu cuenta")."""
    tenant_id: str
    nombre: str
    email: str
    password: str
    plan: Literal["mensual", "anual"] = "mensual"


# Planes de la landing ius + URL de suscripción de Mercado Pago.
# Las URLs se leen de env (MP_LINK_MENSUAL / MP_LINK_ANUAL); si no están
# configuradas quedan los placeholders igual que en la landing, para poder
# desenvolver el flujo antes de conectar los links reales de MP.
PLAN_PRECIOS: Dict[str, Dict[str, Any]] = {
    "mensual": {
        "amount": 690.0,
        "price_label": "$690.00 MXN /mes",
        "url": os.getenv(
            "MP_LINK_MENSUAL",
            "https://www.mercadopago.com.mx/subscriptions/REEMPLAZAR-LINK-MENSUAL",
        ),
    },
    "anual": {
        "amount": 5490.0,
        "price_label": "$5,490.00 MXN /año",
        "url": os.getenv(
            "MP_LINK_ANUAL",
            "https://www.mercadopago.com.mx/subscriptions/REEMPLAZAR-LINK-ANUAL",
        ),
    },
}


@app.post("/api/auth/register")
async def register(data: RegisterRequest):
    """
    Autoregistro público de un usuario admin para un tenant existente
    (flujo "Crea tu cuenta" del frontend-tenant).

    Crea el usuario (rol admin) dentro del tenant indicado y devuelve un
    token JWT (login inmediato) junto con la URL de pago de Mercado Pago
    para el plan elegido. No provee tenants: el tenant debe existir y estar
    activo (ver /api/admin/tenants).

    Args:
        data: Datos de registro (tenant_id, nombre, email, password, plan)

    Returns:
        Token de acceso, datos del usuario y payload de pago del plan.
    """
    tenant = await get_tenant_service().get_tenant(data.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")
    if tenant.status != TenantStatus.ACTIVE:
        raise HTTPException(
            status_code=403,
            detail="El tenant no admite registros en este momento.",
        )

    email = (data.email or "").strip().lower()
    if len(email) < 5 or "@" not in email:
        raise HTTPException(status_code=422, detail="Correo electrónico inválido")
    if len(data.password) < 8:
        raise HTTPException(status_code=422, detail="La contraseña debe tener al menos 8 caracteres")

    # username único = email (mismo formato que usa el resto del sistema).
    username = email

    try:
        user = await get_user_service().create_user(
            username=username,
            password=data.password,
            email=email,
            nombre=data.nombre.strip(),
            tenant_id=tenant.tenant_id,
            role="admin",
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "tenant_id": user.tenant_id, "role": user.role},
        expires_delta=access_token_expires,
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "username": user.username,
            "email": user.email,
            "nombre": user.nombre,
            "apellido": user.apellido,
            "avatar_url": user.avatar_url,
            "tenant_id": user.tenant_id,
            "role": user.role,
        },
        "payment": {
            "plan": data.plan,
            "amount": PLAN_PRECIOS[data.plan]["amount"],
            "price_label": PLAN_PRECIOS[data.plan]["price_label"],
            "url": PLAN_PRECIOS[data.plan]["url"],
        },
    }

# ==================== ENDPOINTS RAG ====================
# Movidos a app/routers/document_router.py, scoped por bot_id:
# /api/bots/{bot_id}/documents (GET/POST /upload/POST /text/DELETE /{doc_id}/GET /stats/DELETE)

# ==================== ENDPOINTS CHAT ====================

@app.post("/api/chat")
async def chat(request: ChatRequest):
    """
    Endpoint legacy pre-multi-tenant (sin bot_id). Deprecado: usar el chat
    scoped por agente (WebSocket /ws/chat/{bot_id} o /ws/chat/channel/{channel_id}).
    """
    raise HTTPException(
        status_code=410,
        detail="Endpoint deprecado. Usá /ws/chat/{bot_id} o /ws/chat/channel/{channel_id}."
    )

# ==================== ENDPOINTS DE CLIENTES (GLOBAL) ====================

@app.get("/api/clients")
async def get_all_clients(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[ClientStatus] = Query(None),
    search: Optional[str] = Query(None),
    color_semaforo: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user)
):
    """
    Obtiene todos los clientes pertenecientes a los bots del usuario autenticado.
    """
    try:
        bot_service = get_bot_service()
        bots_result = await bot_service.get_bots_by_tenant(
            tenant_id=current_user.tenant_id, skip=0, limit=1000
        )
        bot_ids = [b.bot_id for b in bots_result["bots"]]

        client_service = get_client_service()
        skip = (page - 1) * limit
        owner_usernames = await get_user_service().get_scoped_owner_usernames(current_user)
        result = await client_service.get_clients_by_bot_ids(
            bot_ids=bot_ids,
            skip=skip,
            limit=limit,
            status=status,
            search=search,
            color_semaforo=color_semaforo,
            owner_usernames=owner_usernames,
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


@app.get("/api/clients/stats")
async def get_clients_color_stats(current_user: User = Depends(get_current_user)):
    """
    Cuenta los clientes del tenant agrupados por color_semaforo (embudo de
    ventas) — usado por los cards del Escritorio (ver StatsCards.tsx).
    """
    try:
        bot_service = get_bot_service()
        bots_result = await bot_service.get_bots_by_tenant(
            tenant_id=current_user.tenant_id, skip=0, limit=1000
        )
        bot_ids = [b.bot_id for b in bots_result["bots"]]

        client_service = get_client_service()
        owner_usernames = await get_user_service().get_scoped_owner_usernames(current_user)
        counts = await client_service.count_clients_by_color(bot_ids, owner_usernames=owner_usernames)

        return {"success": True, **counts}

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error obteniendo estadísticas de clientes: {str(e)}"
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
        bots_result = await bot_service.get_bots_by_tenant(
            tenant_id=current_user.tenant_id, skip=0, limit=1000
        )
        tenant_bot_ids = [b.bot_id for b in bots_result["bots"]]

        # Calcular skip para paginación
        skip = (page - 1) * limit

        owner_usernames = await get_user_service().get_scoped_owner_usernames(current_user)
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
            bot_ids=tenant_bot_ids,
            owner_usernames=owner_usernames
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
        bots_result = await bot_service.get_bots_by_tenant(
            tenant_id=current_user.tenant_id, skip=0, limit=1000
        )
        tenant_bot_ids = [b.bot_id for b in bots_result["bots"]]

        owner_usernames = await get_user_service().get_scoped_owner_usernames(current_user)
        timeline = await conv_service.get_timeline_stats(
            days=days, bot_ids=tenant_bot_ids, owner_usernames=owner_usernames
        )

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
        bots_result = await bot_service.get_bots_by_tenant(
            tenant_id=current_user.tenant_id, skip=0, limit=1000
        )
        tenant_bot_ids = [b.bot_id for b in bots_result["bots"]]

        owner_usernames = await get_user_service().get_scoped_owner_usernames(current_user)
        stats = await conv_service.get_conversation_stats(bot_ids=tenant_bot_ids, owner_usernames=owner_usernames)

        return {
            "success": True,
            "stats": stats
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error obteniendo estadísticas: {str(e)}"
        )

async def _verify_conversation_owner_access(conversation: dict, current_user: User) -> None:
    """404 si el cliente dueño de la conversación no está en el alcance del
    usuario actual (ver UserService.get_scoped_owner_usernames) — mismo
    criterio que client_router.py para /api/bots/{bot_id}/clients."""
    owner_usernames = await get_user_service().get_scoped_owner_usernames(current_user)
    if owner_usernames is None:
        return
    client_id = conversation.get("client_id")
    client = await get_client_service().get_client(client_id) if client_id else None
    if not client or client.owner_username not in owner_usernames:
        raise HTTPException(status_code=404, detail="Conversación no encontrada")


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
            conv_bot = await bot_service.get_bot(conv_bot_id)
            if not conv_bot or conv_bot.tenant_id != current_user.tenant_id:
                raise HTTPException(
                    status_code=404,
                    detail=f"Conversación {conversation_id} no encontrada"
                )
        await _verify_conversation_owner_access(conversation, current_user)

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
            conv_bot = await bot_service.get_bot(conv_bot_id)
            if not conv_bot or conv_bot.tenant_id != current_user.tenant_id:
                raise HTTPException(status_code=404, detail="Conversación no encontrada")
        await _verify_conversation_owner_access(conversation, current_user)

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


@app.post("/api/conversations/{conversation_id}/summary")
async def generate_conversation_summary(
    conversation_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Genera un resumen ejecutivo de la conversación completa vía LLM y
    actualiza el Client asociado con los datos mínimos que declare
    bot.config.flow.steps (ver conversation_summary_service.py).
    """
    try:
        conv_service = get_conversation_service()
        conversation = await conv_service.get_conversation(conversation_id)

        if not conversation:
            raise HTTPException(status_code=404, detail="Conversación no encontrada")

        conv_bot_id = conversation.get("bot_id")
        if conv_bot_id:
            bot_service = get_bot_service()
            conv_bot = await bot_service.get_bot(conv_bot_id)
            if not conv_bot or conv_bot.tenant_id != current_user.tenant_id:
                raise HTTPException(status_code=404, detail="Conversación no encontrada")
        await _verify_conversation_owner_access(conversation, current_user)

        result = await generate_summary_and_update_client(conversation_id)
        return {
            "success": True,
            "summary": result["summary"],
            "client_id": result["client_id"],
            "updated_fields": result["updated_fields"],
        }

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando resumen: {str(e)}")


# ==================== ENDPOINTS WHATSAPP ====================

@app.get("/api/webhook", response_class=PlainTextResponse)
@app.post("/api/webhook")
async def legacy_whatsapp_webhook():
    """
    Endpoint legacy pre-multi-tenant (sin bot_id, usaba env vars globales
    WHATSAPP_TOKEN/WHATSAPP_PHONE_ID). Deprecado: usar
    /api/webhook/whatsapp/meta/{channel_id} o /api/webhook/whatsapp/twilio/{channel_id}.
    """
    raise HTTPException(
        status_code=410,
        detail="Endpoint deprecado. Usá /api/webhook/whatsapp/meta/{channel_id} o "
               "/api/webhook/whatsapp/twilio/{channel_id}."
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

        # Este webhook es global (sin channel_id en la URL), pero si el
        # TELEGRAM_BOT_TOKEN coincide con el de un canal configurado, resolvemos
        # su bot_id para que el mensaje use el system_prompt/ius_config y el RAG
        # propios de ese agente (en vez de quedar sin agente asociado).
        channel = await get_channel_service().get_channel_by_telegram_token(telegram.bot_token)
        if channel:
            message_data["bot_id"] = channel.bot_id
            try:
                client_service = get_client_service()
                client = await client_service.get_or_create_client(
                    bot_id=channel.bot_id,
                    external_id=str(message_data["user_id"]),
                    source="telegram",
                    metadata={"first_name": message_data.get("first_name")},
                )
                message_data["client_id"] = client.client_id
            except Exception as e:
                print(f"⚠️ Error registrando cliente Telegram: {e}")

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

    # Inicializar usuarios en PostgreSQL y crear admin por defecto
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
        print("   Revisá LLM_PROVIDER y las credenciales en .env.dev (o .env.prod)")
    except Exception as e:
        print(f"⚠️  Error inicializando LLM: {e}")

    # Inicializar WhatsApp service
    try:
        whatsapp = get_whatsapp_service()
        print("✅ WhatsApp Service inicializado")
        if not whatsapp.access_token or not whatsapp.phone_number_id:
            print("⚠️  WhatsApp API no configurado completamente")
            print("   Para usar WhatsApp, configura WHATSAPP_TOKEN y WHATSAPP_PHONE_ID en .env.dev (o .env.prod)")
    except Exception as e:
        print(f"⚠️  Error inicializando WhatsApp: {e}")

    # Inicializar Telegram service
    try:
        telegram = get_telegram_service()
        print("✅ Telegram Service inicializado")
        if not telegram.bot_token:
            print("⚠️  Telegram Bot no configurado completamente")
            print("   Para usar Telegram, configura TELEGRAM_BOT_TOKEN en .env.dev (o .env.prod)")
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
            print("   Genera las claves y agrega VAPID_PRIVATE_KEY y VAPID_PUBLIC_KEY al .env.dev (o .env.prod)")
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
