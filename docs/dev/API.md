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

Autoregistro público de un usuario **admin** para un tenant existente
(flujo "Crea tu cuenta" del frontend-tenant). Crea el usuario y devuelve un
token JWT (login inmediato) junto con la URL de pago de Mercado Pago del
plan elegido. No provee tenants: el tenant debe existir y estar activo. Es
el reintento de la funcionalidad que antes estuvo deprecada (410).

Usa `application/json`.

**Request (JSON):**
```json
{
  "tenant_id": "tenant_6a10b2076443",
  "nombre": "Ana García",
  "email": "ana@despacho.com",
  "password": "mi_password_seguro",
  "plan": "mensual"
}
```
- `plan`: `"mensual"` | `"anual"` (default `"mensual"`).
- `password`: mínimo 8 caracteres. `email` se usa como `username` único.

**Response 200:**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "user": { "username": "ana@despacho.com", "email": "ana@despacho.com", "nombre": "Ana García", "tenant_id": "tenant_6a10b2076443", "role": "admin" },
  "payment": {
    "plan": "mensual",
    "amount": 690.0,
    "price_label": "$690.00 MXN /mes",
    "url": "https://www.mercadopago.com.mx/subscriptions/..."
  }
}
```
La `payment.url` apunta a la suscripción de Mercado Pago del plan (précios y
URLs configurados vía env `MP_LINK_MENSUAL` / `MP_LINK_ANUAL`).

El plan elegido se **registra en el usuario en estado Pendiente**
(`requested_plan_id` = plan del catálogo de la periodicidad correspondiente,
`subscription_status='pending'`). El pase a aprobado/vigente es manual
(super_admin) vía `PATCH /api/admin/users/{username}/plan-request` (ver ADR-013).

Para el tenant ius solo hay dos planes — **Pro Mensual** (`monthly`) y
**Pro Anual** (`annual`), seedeados como `plan_pro_mensual` /
`plan_pro_anual`. La resolución elige el **plan pagado** de la periodicidad
(no el Plan Básico por defecto `plan_000000000000`, amount 0): `mensual` →
Pro Mensual, `anual` → Pro Anual.

**Errores:** `404` si el tenant no existe; `403` si no está activo;
`409` si el email/username ya existe; `422` si el email o password no
cumplen lo mínimo.

---

### GET `/api/auth/me`

Obtener usuario autenticado actual. Requiere JWT.

---

### POST `/api/auth/biometric/enroll`

Registra o actualiza la credencial biométrica (huella) de un dispositivo. **Requiere JWT** (el usuario ya se logueó con password o OAuth). Solo se guarda el hash SHA-256 del secreto del dispositivo, nunca el secreto en claro.

**Request:**
```json
{
  "device_id": "uuid-del-dispositivo",
  "secret_hash": "<sha256 hex de 64 chars del secreto>",
  "device_name": "Motorola G73 de Juan",
  "platform": "android"
}
```

**Response 200:**
```json
{ "success": true, "device_id": "uuid-del-dispositivo", "updated": false, "message": "Credencial biométrica registrada" }
```

Re-enrolar el mismo `device_id` es un update (`updated: true`) — cubre el cambio de huellas (el Keystore invalida el secreto anterior).

---

### POST `/api/auth/biometric/login`

Inicia sesión con la huella: emite un JWT nuevo a partir del secreto del dispositivo (ya desbloqueado por la huella en el cliente). **No requiere JWT** — es la contraparte biométrica de `POST /api/auth/login`. Devuelve la misma forma que el login normal.

**Request:**
```json
{
  "username": "operativo_ius",
  "device_id": "uuid-del-dispositivo",
  "secret": "<secreto del dispositivo, desbloqueado por la huella>"
}
```

**Response 200:**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "user": { "username": "operativo_ius", "role": "operativo", "tenant_id": "..." }
}
```

**401** — credencial biométrica inválida o revocada: el cliente cae a login con contraseña.

---

### GET `/api/auth/biometric/devices`

Lista los dispositivos con huella habilitada del usuario actual. **Requiere JWT.**

**Response 200:**
```json
[
  {
    "device_id": "uuid-del-dispositivo",
    "device_name": "Motorola G73 de Juan",
    "platform": "android",
    "created_at": "2026-08-07T10:00:00+00:00",
    "last_used_at": "2026-08-07T11:00:00+00:00",
    "current": false
  }
]
```

---

### DELETE `/api/auth/biometric/devices/{device_id}`

Revoca el login biométrico de un dispositivo del usuario actual (no borra la fila; marca `revoked=true`). **Requiere JWT.**

**Response 200:**
```json
{ "success": true, "device_id": "uuid-del-dispositivo", "message": "Dispositivo revocado" }
```

**404** — dispositivo no encontrado o no pertenece al usuario.

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


## Push Notifications (PWA + Apps Nativas)

Registro de suscripciones push. Soporta tres plataformas: `vapid` (PWA web),
`fcm` (Android nativo), `apns` (iOS nativo).

### GET `/api/push/vapid-public-key`

Obtener clave pública VAPID para suscripción en el navegador. Sin cambios.

### POST `/api/push/subscribe`

Registrar suscripción push. Acepta dos formatos según `platform`.

**VAPID (PWA web) — sin cambios:**
```json
{
  "platform": "vapid",
  "bot_id": "bot_abc123",
  "channel_id": "channel_xyz",
  "client_id": "client_def",
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/...",
    "keys": { "p256dh": "...", "auth": "..." }
  }
}
```

**FCM / APNs (apps nativas) — nuevo:**
```json
{
  "platform": "fcm",
  "bot_id": "bot_abc123",
  "device_token": "eIx...fcm_token",
  "user_id": "admin",
  "client_id": null
}
```

`user_id` y `client_id` son mutuamente excluyentes:
- Staff app → `user_id` poblado, `client_id: null`
- Client app → `client_id` poblado, `user_id: null`

### POST `/api/push/send`

Enviar notificación push. Requiere JWT. Sin cambios en el contrato;
el backend routea automáticamente por `platform` del registro.

---

## WebSocket — Staff Chat (Nuevo)

Conexión para que el staff (admin/operador) reciba mensajes de clientes
y responda en tiempo real desde la app mobile.

### `WS /ws/staff/chat/{bot_id}`

**Requiere:** JWT vía query param `?token=eyJ...`

**Eventos del servidor → staff:**

```json
// Nuevo mensaje de un cliente
{
  "type": "client_message",
  "conversation_id": "conv_abc",
  "client_id": "client_xyz",
  "client_name": "María",
  "channel": "whatsapp",
  "content": "Hola, necesito ayuda con...",
  "timestamp": "2026-07-13T14:30:00Z"
}
```

```json
// Cliente se conectó al chat
{
  "type": "client_connected",
  "client_id": "client_xyz",
  "client_name": "María",
  "channel": "pwa"
}
```

```json
// Cliente está escribiendo
{
  "type": "client_typing",
  "conversation_id": "conv_abc",
  "client_id": "client_xyz"
}
```

**Eventos del staff → servidor:**

```json
// Responder a un cliente
{
  "type": "agent_message",
  "conversation_id": "conv_abc",
  "content": "Hola María, ya reviso tu caso."
}
```

```json
// Staff está escribiendo (se forwardea al cliente)
{
  "type": "agent_typing",
  "conversation_id": "conv_abc"
}
```

**Nota:** El cliente (PWA o app nativa) se conecta al WebSocket existente
`/ws/chat/channel/{channel_id}`. El backend forwardea mensajes entre
el WebSocket del cliente y el WebSocket del staff en tiempo real.
Si el staff está offline, se envía push notification (FCM/APNs/VAPID).
---


## Administración general — Tenants

CRUD de tenants para el `super_admin` (panel admin). Requieren JWT con rol
`super_admin`.

### POST `/api/admin/tenants`

Crear un tenant. Body:
```json
{ "name": "pachoteayuda", "domain": "pachoteayuda.ar", "plan_id": "plan_000000000000" }
```
`status` (opcional, default `active`) y `branding` (opcional).

### GET `/api/admin/tenants?page=1&limit=20`

Lista paginada de tenants.

### GET `/api/admin/tenants/{tenant_id}`

Detalle de un tenant.

### PATCH `/api/admin/tenants/{tenant_id}`

Editar un tenant. Todos los campos opcionales: `name`, `domain`, `status`
(`active`|`suspended`|`trial`), `branding`, `plan_id`.

### DELETE `/api/admin/tenants/{tenant_id}`

Eliminar un tenant. **409** si el tenant no existe o tiene datos asociados
(bots, usuarios, canales, clientes, conversaciones) que deben eliminarse
primero — nunca borra en cascada datos de negocio.

---

## Tenant — Branding

Endpoints para que el admin del tenant gestione su marca (logo, color, tagline).
Requieren JWT. Solo el rol `admin` del tenant puede modificar branding.

### POST `/api/tenant/branding/logo`

Subir el logo del tenant. Acepta multipart `file`.

**Request:** `multipart/form-data`
- `file`: imagen (JPG, PNG, WEBP, SVG — hasta 2MB)

**Response 200:**
```json
{ "success": true, "url": "/api/uploads/tenants/abc123.png" }
```

### PATCH `/api/tenant/branding`

Actualizar color principal y/o tagline. Ambos campos opcionales.

**Request:**
```json
{ "primary_color": "#ff5722", "tagline": "Justicia laboral" }
```

**Response 200:**
```json
{
  "success": true,
  "branding": {
    "logo_url": "/api/uploads/tenants/abc123.png",
    "primary_color": "#ff5722",
    "tagline": "Justicia laboral"
  }
}
```

### DELETE `/api/tenant/branding/logo`

Eliminar el logo del tenant (solo la referencia — no borra el archivo en disco).

**Response 200:**
```json
{ "success": true }
```

---

## Tenant — OAuth (login social)

Login con Google/Microsoft por tenant vía Nango. En web, el popup de Nango
avisa el resultado por `window.postMessage`; en mobile (Chrome Custom Tabs, sin
`window.opener`) el backend se entera por el webhook de Nango y la app hace
polling. No requieren JWT (públicos, scoped al tenant).

### POST `/api/tenant/oauth/connect/login/session`

Crea una sesión de login OAuth para el tenant. Body: `{tenant_id, provider}`
(`provider`: `google` | `microsoft`). Devuelve `sessionToken` (Connect UI web),
`connectLink` (magic link para abrir en Custom Tabs), `nonce` (token firmado,
válido 5 min) y `providerConfigKey`. Registra el login como `pending` en Redis.

### GET `/api/tenant/oauth/connect/login/status?nonce=<token>`

Polling mobile. Devuelve `{"status": "pending"}` mientras el login no
resuelve, o el resultado (`{"status": "done", "token": ...}` /
`{"status": "error", "message": ...}`). **Lee sin consumir** (peek) — el
resultado queda disponible hasta el TTL (5 min); un fetch-and-delete perdería
el login si la request que lo consumía se aborta al retomar la WebView tras el
Custom Tab. Además, si sigue `pending`, el endpoint **resuelve el login
activamente** (pull): busca en Nango la connection creada por el Custom Tab
(`GET /connection?endUserId=<nonce_id>`) y completa el login sin esperar el
webhook — el webhook (push) es solo el camino rápido, este fallback hace el
flujo mobile independiente de su entrega.

### POST `/api/tenant/oauth/connect/login/finalize`

Flujo web: completa el login con un `connectionId` ya autorizado. Body:
`{connectionId, provider, nonce, plan?}` (`plan`: `mensual` | `anual`, para el
autoregistro). Verifica que la connection pertenezca al nonce. Devuelve el
resultado del login (token + usuario del proveedor).

### POST `/api/tenant/oauth/webhook/nango`

Webhook entrante de Nango (evento `auth`). Verifica firma
(`X-Nango-Hmac-Sha256` contra `NANGO_WEBHOOK_SECRET`; 401 si no coincide, o
acepta sin verificar si el secret está vacío). Resuelve el login `pending`
del `endUser.endUserId` y guarda el resultado. Configurar en el dashboard de
Nango: Webhook URL = `https://api.intellify.pro/api/tenant/oauth/webhook/nango`
+ evento auth (ver `docs/dev/SETUP.md`).

## Tenant — Usuarios

Gestión de usuarios del propio tenant (requiere JWT con rol `admin` del
tenant). Todos los endpoints están scoped a `current_user.tenant_id`.

### GET `/api/tenant/users`

Lista los usuarios del tenant. Query: `page`, `limit`.

### POST `/api/tenant/users`

Crea un usuario en el tenant. `tenant_id` se fuerza desde el JWT (no se
acepta en el body). Rol: `admin` | `operativo` (nunca `super_admin`).

### PATCH `/api/tenant/users/{username}`

Edita un usuario del tenant (email, nombre, apellido, avatar, rol, estado) y el
**estado de la suscripción** del plan asociado (`subscription_status`:
`pending` | `approved` | `active`) — el admin del tenant puede aprobar un plan
pendiente, de acuerdo al flujo de ADR-013. El usuario debe pertenecer al tenant
del admin autenticado.

**Request (JSON, solo se envían los campos a cambiar):**
```json
{ "subscription_status": "active" }
```

### DELETE `/api/tenant/users/{username}`

Elimina un usuario del propio tenant (p.ej. para quitar cuentas de prueba
creadas por autoregistro/gmail en desarrollo).

- `400` si intentás borrarte a ti mismo.
- `404` si el usuario no existe o no pertenece a tu tenant.
- `409` si el usuario tiene recursos asociados (bots/canales) que impiden el
  borrado.

**Response 200:**
```json
{ "success": true, "message": "Usuario eliminado" }
```

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
