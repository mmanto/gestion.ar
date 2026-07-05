# API.md — Contratos de API

Documentación de los endpoints del backend (FastAPI).
La documentación interactiva está disponible en `/docs` (Swagger) cuando el servidor está corriendo.

---

## Convenciones

- **Base URL:** `/api`
- **Autenticación:** Bearer token JWT en header `Authorization: Bearer <token>`
- **Formato:** JSON en request y response
- **Paginación:** `?page=1&limit=20` (response incluye `total`, `page`, `pages`)

---

## Autenticación

### POST `/api/auth/login`

Obtener token JWT. Usa `application/x-www-form-urlencoded`.

**Request (form):**
```
username=admin&password=tu_password
```

**Response 200:**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "user": { "username": "admin", "email": "admin@example.com" }
}
```

---

### POST `/api/auth/register`

Registrar nuevo usuario. Usa `application/x-www-form-urlencoded`.

**Request (form):**
```
username=nuevo_usuario&password=mi_password&email=email@ejemplo.com
```

**Response 200:**
```json
{
  "success": true,
  "message": "Usuario creado exitosamente",
  "user": { "username": "nuevo_usuario", "email": "email@ejemplo.com" }
}
```

---

### GET `/api/auth/me`

Obtener usuario autenticado actual. Requiere JWT.

---

## Bots

Todos los endpoints de bots requieren JWT. Los bots son filtrados por el `owner_id` del usuario autenticado.

### GET `/api/bots`

Listar bots del usuario. Query params: `skip`, `limit`, `status`.

### POST `/api/bots`

Crear un bot.

**Request:**
```json
{
  "name": "Asistente Legal",
  "description": "Bot para consultas legales laborales",
  "business_type": "servicios_legales",
  "config": {
    "system_prompt": "Eres un asistente legal...",
    "welcome_message": "¡Hola! ¿En qué puedo ayudarte?",
    "use_rag": true,
    "max_tokens": 1024,
    "temperature": 0.7,
    "rate_limit_messages": 10
  }
}
```

### GET `/api/bots/{bot_id}`

Obtener un bot por ID.

### PUT `/api/bots/{bot_id}`

Actualizar un bot.

### DELETE `/api/bots/{bot_id}`

Eliminar un bot y todos sus canales asociados.

---

## Canales

Un canal conecta un bot con una plataforma de mensajería específica.

### GET `/api/bots/{bot_id}/channels`

Listar canales de un bot.

### POST `/api/bots/{bot_id}/channels`

Crear un canal.

**Ejemplo — WhatsApp Meta:**
```json
{
  "bot_id": "bot_123",
  "channel_type": "whatsapp",
  "name": "WhatsApp Principal",
  "whatsapp_config": {
    "provider": "meta",
    "meta_config": {
      "phone_number_id": "123456789",
      "access_token": "EAARxxx",
      "verify_token": "mi_verify_token",
      "api_version": "v21.0"
    }
  }
}
```

**Ejemplo — Telegram:**
```json
{
  "bot_id": "bot_123",
  "channel_type": "telegram",
  "name": "Telegram Bot",
  "telegram_config": {
    "bot_token": "1234567890:ABCdef",
    "webhook_secret": "mi_secreto"
  }
}
```

**Ejemplo — Web (WebSocket):**
```json
{
  "bot_id": "bot_123",
  "channel_type": "web",
  "name": "Chat Web",
  "web_config": { "allowed_origins": ["https://mi-sitio.com"] }
}
```

### GET `/api/channels/{channel_id}`

Obtener un canal por ID.

### PUT `/api/channels/{channel_id}`

Actualizar la configuración de un canal.

### DELETE `/api/channels/{channel_id}`

Eliminar un canal.

---

## Clientes

Personas que interactúan con un bot a través de algún canal.

### GET `/api/clients`

Listar todos los clientes de los bots del usuario autenticado. Query params: `page`, `limit`, `status`, `search`.

### GET `/api/bots/{bot_id}/clients`

Listar clientes de un bot específico.

### GET `/api/bots/{bot_id}/clients/{client_id}`

Obtener un cliente específico.

### PUT `/api/bots/{bot_id}/clients/{client_id}`

Actualizar datos del cliente (nombre, email, estado, score).

---

## Conversaciones

### GET `/api/conversations`

Listar conversaciones del usuario. Query params: `page`, `limit`, `user_id`, `platform`, `date_from`, `date_to`, `search`, `sort_by`, `order`.

### GET `/api/conversations/stats`

Estadísticas globales de conversaciones (total, tokens, costo, plataformas).

### GET `/api/conversations/stats/timeline`

Estadísticas por día. Query: `days` (1-365).

### GET `/api/conversations/{conversation_id}`

Obtener conversación completa con todos sus mensajes.

### POST `/api/conversations/{conversation_id}/agent-message`

Enviar un mensaje de agente humano a una conversación activa. Se entrega via WebSocket si el cliente está conectado y dispara push notification.

**Request:**
```json
{ "content": "Hola, soy un agente humano. ¿En qué puedo ayudarte?" }
```

---

## RAG (Knowledge Base)

Todos los endpoints están scoped por bot (`bot_id` en la URL) y requieren JWT
del propietario del bot (mismo patrón que Canales/Turnos). Cada documento
pertenece a un único agente; no hay forma de listar/buscar/borrar documentos
de otro bot.

### GET `/api/bots/{bot_id}/documents`

Listar documentos del agente.

### POST `/api/bots/{bot_id}/documents/upload`

Subir un archivo (PDF, DOCX, TXT) para indexar en el RAG de este agente.

**Request:** `multipart/form-data`
- `file`: archivo
- `title`: título (string)
- `category`: categoría (string, default: "general")

### POST `/api/bots/{bot_id}/documents/text`

Agregar texto directamente al RAG de este agente.

**Request:**
```json
{
  "title": "Horarios de atención",
  "text": "Lunes a Viernes de 9:00 a 18:00.",
  "category": "info"
}
```

### DELETE `/api/bots/{bot_id}/documents/{doc_id}`

Eliminar un documento del agente por doc_id. 404 si el doc_id no pertenece a este bot.

### GET `/api/bots/{bot_id}/documents/stats`

Estadísticas de la base de conocimiento de este agente (total chunks, dimensión de embeddings).

### DELETE `/api/bots/{bot_id}/documents?confirm=ELIMINAR`

Vaciar toda la base de conocimiento de este agente. Requiere `?confirm=ELIMINAR`.

---

## Endpoints deprecados

- `POST /api/chat` — 410 Gone. Usar `/ws/chat/{bot_id}` o `/ws/chat/channel/{channel_id}`.
- `GET`/`POST /api/webhook` (WhatsApp legacy, sin `channel_id`) — 410 Gone. Usar `/api/webhook/whatsapp/meta/{channel_id}` o `/twilio/{channel_id}`.
- `POST /api/webhook/telegram` (sin `channel_id`) — **no deprecado** (bot de Telegram real en uso). Resuelve `bot_id` buscando un canal cuyo `telegram_config.bot_token` coincida con `TELEGRAM_BOT_TOKEN`; si no hay match, procesa el mensaje sin agente asociado (sin RAG, prompt genérico) y rechaza subida de documentos.

---

## Webhooks entrantes (canales)

Estos endpoints reciben mensajes de plataformas externas. No requieren JWT.

### WhatsApp (Meta)

- `GET /api/webhook/whatsapp/meta/{channel_id}` — Verificación del webhook
- `POST /api/webhook/whatsapp/meta/{channel_id}` — Recibir mensajes

### WhatsApp (Twilio)

- `POST /api/webhook/whatsapp/twilio/{channel_id}` — Recibir mensajes (Twilio usa POST para verificación)

### Telegram

- `POST /api/webhook/telegram/{channel_id}` — Recibir updates

---

## Web Chat (WebSocket)

- `GET /api/web-chat/{channel_id}/qr` — Obtener QR code para iniciar chat
- `WS /api/web-chat/{channel_id}/ws/{session_id}` — Conexión WebSocket para chat en tiempo real

---

## PWA (Push Notifications)

- `GET /api/pwa/vapid-public-key` — Obtener clave pública VAPID para suscripción en el navegador
- `POST /api/pwa/subscribe` — Registrar suscripción push de un cliente
- `POST /api/pwa/send` — Enviar notificación push manualmente (requiere JWT)

---

## Sistema

### GET `/`

Endpoint raíz. No requiere auth.

### GET `/api/health`

Health check. Devuelve `{"status": "healthy", "timestamp": "...", "service": "...", "version": "0.1.0"}`.

---

## Autenticación en Swagger

1. Abrir `/docs`
2. Hacer clic en **Authorize**
3. Obtener token via `POST /api/auth/login`
4. Pegar: `Bearer eyJ...`
