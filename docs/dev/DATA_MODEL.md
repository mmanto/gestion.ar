# DATA_MODEL.md — Modelo de Datos

El proyecto usa PostgreSQL como base de datos principal (relacional), vía SQLAlchemy
async + Alembic (ver ADR-006 en `DECISIONS.md`). Los modelos ORM viven en
`backend/app/db/models.py`; los schemas Pydantic de `backend/app/models/` siguen
siendo la fuente de verdad para la validación/serialización de las APIs.

---

## Convenciones

- **IDs:** prefijados por tipo (`bot_`, `client_`, `channel_`, `sub_`) + hex corto, como `TEXT PRIMARY KEY` (no son `SERIAL`/`UUID` nativos — se generan en código Python, igual que antes). La excepción es `messages.message_id`, `BIGSERIAL` autoincremental (tabla nueva, sin IDs previos que preservar).
- **Timestamps:** `TIMESTAMPTZ` nativos (`created_at`, `updated_at`, con `server_default=now()` y `onupdate=now()` donde corresponde) — ya no son strings ISO como en Mongo; las APIs siguen serializando a ISO 8601 en la capa de servicio.
- **Driver:** `asyncpg` en runtime (SQLAlchemy async engine, `backend/app/db/database.py`), `psycopg2` sólo para que Alembic corra las migraciones.
- **Migraciones:** Alembic versionado (`backend/alembic/versions/`) — ya no hay `ensure_indexes()` al boot, los índices se crean vía migración.
- **Tablas:** snake_case plural (`bots`, `clients`, `channels`, `conversations`, `messages`, `users`, `push_subscriptions`), con Foreign Keys nativas entre ellas (a diferencia de Mongo, donde la consistencia referencial vivía sólo en la capa de servicio).
- **JSONB:** los campos de configuración que siguen siendo esquemas semi-estructurados y en evolución activa (`bots.config`, `channels.*_config`, `metadata` en varias tablas) se mantienen como `JSONB`, no se normalizan a columnas — ver ADR-006 para el razonamiento.

---

## Entidades

### `users`

Usuarios del dashboard (propietarios de bots).

| Campo | Tipo | Descripción |
|---|---|---|
| `username` | `TEXT PK` | Identificador único |
| `email` | `TEXT` (opt) | Email del usuario |
| `hashed_password` | `TEXT` | Hash bcrypt del password |
| `disabled` | `BOOLEAN` | Cuenta deshabilitada |
| `auth_provider` / `provider_user_id` | `TEXT` (opt) | Identidad de login social (Nango) |
| `google_id` | `TEXT` (opt) | Legacy, login Google directo |
| `nango_connection_id` / `gmail_sender_email` | `TEXT` (opt) | Conexión de email vía Nango (envío, no login) |
| `created_at` | `TIMESTAMPTZ` | Fecha de creación |

Índices: `google_id` único parcial (`WHERE google_id IS NOT NULL`), `email`, `(auth_provider, provider_user_id)`.

---

### `bots`

Un bot es la entidad central: agrupa la configuración del LLM, sus canales y sus clientes.

| Campo | Tipo | Descripción |
|---|---|---|
| `bot_id` | `TEXT PK` | ID único (`bot_xxxx`) |
| `owner_id` | `TEXT` → FK `users.username` | Propietario |
| `name` / `description` / `business_type` | `TEXT` | |
| `status` | `TEXT` | `active` / `inactive` / `maintenance` |
| `config` | `JSONB` | Configuración del LLM y RAG (ver `BotConfig` abajo) |
| `channel_ids` | `JSONB` (lista de strings) | IDs de canales asociados — no es FK ni se deriva de `channels` (evita acoplamiento circular con ese servicio) |
| `metadata` | `JSONB` (opt) | Libre |
| `total_clients` / `total_conversations` / `total_messages` | `INT` | Contadores (hoy sin lógica productiva que los incremente — ver nota en `bot_service.py`) |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | |

Índices: `owner_id`, `status`, `created_at`.

**Nota:** el campo legacy `channels` (config de canales embebida, deprecated) existía en Mongo pero estaba vacío en el 100% de los bots reales — no se migró, no tiene columna.

#### BotConfig (dentro de `config`, JSONB)

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `system_prompt` | string | "Eres un asistente..." | Prompt del sistema para el LLM |
| `ius_config` | dict (opt) | null | JSON del agente IUS. Si presente, reemplaza system_prompt |
| `welcome_message` | string | "¡Hola!..." | Mensaje de bienvenida a nuevos clientes |
| `fallback_message` | string | "Lo siento..." | Respuesta cuando no se puede procesar |
| `max_tokens` | int | 1024 | Máximo de tokens de respuesta |
| `temperature` | float | 0.7 | Temperatura del LLM (0.0 - 1.0) |
| `use_rag` | bool | true | Activar/desactivar RAG |
| `rag_results_count` | int | 3 | Número de chunks RAG a recuperar |
| `rate_limit_messages` | int | 10 | Mensajes por ventana |
| `rate_limit_window` | int | 60 | Ventana en segundos |
| `flow` | FlowConfig (opt) | null | Flujo conversacional progresivo (LeadTrackers) |

#### FlowConfig / FlowStep

Igual que antes (sin cambios de esquema) — permite al bot guiar al usuario por preguntas secuenciales. `FlowConfig`: `enabled`, `steps: [FlowStep]`, `completion_message`, `skip_if_known`. `FlowStep`: `field`, `question`, `field_type`, `choices`, `required`, `score_weight`.

---

### `channels`

Un canal es la configuración de una plataforma de mensajería asociada a un bot.

| Campo | Tipo | Descripción |
|---|---|---|
| `channel_id` | `TEXT PK` | ID único (`channel_xxxx`) |
| `bot_id` | `TEXT` → FK `bots.bot_id` `ON DELETE CASCADE` | |
| `channel_type` | `TEXT` | `whatsapp` / `telegram` / `web` / `pwa` |
| `name` / `status` / `webhook_url` | `TEXT` | |
| `whatsapp_config` / `telegram_config` / `web_config` / `pwa_config` | `JSONB` (opt, una columna por tipo) | Sólo la correspondiente al `channel_type` suele estar poblada, pero **no hay CHECK constraint** que lo exija — ver nota abajo |
| `total_messages_received` / `total_messages_sent` | `INT` | |
| `metadata` | `JSONB` (opt) | |
| `created_at` / `updated_at` / `last_activity_at` | `TIMESTAMPTZ` | |

Índices: `bot_id`, `(bot_id, channel_type)`, `status`, índice de expresión sobre `(whatsapp_config->'twilio_config'->>'phone_number')` (usado por `get_channel_by_twilio_phone`).

**Nota histórica:** el esquema inicial (Fase 1 de la migración) tenía 4 `CHECK constraints` que exigían `*_config IS NOT NULL` según `channel_type`. Se eliminaron: la lógica real (`channel_router.py`) sólo valida `whatsapp_config`/`telegram_config` al crear, nunca `web_config`/`pwa_config` — y los canales reales de esos dos tipos existen sin config poblada.

#### WhatsAppConfig (proveedores)

Soporta dos proveedores: `meta` (Meta Cloud API directo) y `twilio`. Para `provider=meta`: requiere `meta_config.phone_number_id/access_token/verify_token`. Para `provider=twilio`: requiere `twilio_config.account_sid/auth_token/phone_number`.

---

### `clients`

Personas que interactúan con un bot a través de algún canal.

| Campo | Tipo | Descripción |
|---|---|---|
| `client_id` | `TEXT PK` | ID único (`client_xxxx`) |
| `bot_id` | `TEXT` → FK `bots.bot_id` `ON DELETE CASCADE` | |
| `external_id` | `TEXT` | ID externo: número de teléfono, chat_id, session_id |
| `source` | `TEXT` | `whatsapp` / `telegram` / `web` / `manual` |
| `name` / `email` / `phone` | `TEXT` (opt) | |
| `status` | `TEXT` | `active` / `blocked` / `archived` |
| `score` | `NUMERIC` | Lead score (0-100), calculado por `calculate_score()` en `client_service.py` |
| `total_conversations` / `total_messages` / `total_tokens_used` | `INT` | |
| `first_contact_at` / `last_contact_at` | `TIMESTAMPTZ` | |
| `metadata` | `JSONB` (opt) | Respuestas capturadas por el flujo conversacional |

Índices: `(bot_id, external_id)` único, `(bot_id, status)`, `last_contact_at`, `score`.

---

### `conversations`

Cada conversación agrupa los mensajes de un cliente con un bot en una sesión.

| Campo | Tipo | Descripción |
|---|---|---|
| `conversation_id` | `TEXT PK` | |
| `bot_id` | `TEXT` (opt) → FK `bots.bot_id` | Nullable: conversaciones legacy pre-multi-tenant podían no tener bot |
| `client_id` | `TEXT` (opt) → FK `clients.client_id` | |
| `user_id` | `TEXT` | Identificador del usuario final (teléfono, session_id, etc.) |
| `channel` | `TEXT` (opt) | `whatsapp` / `telegram` / `web` / `pwa` |
| `source` | `TEXT` (opt) | Promovido desde `metadata.source` — columna propia porque se filtra con `WHERE` real en stats/búsqueda |
| `channel_id` | `TEXT` (opt) → FK `channels.channel_id` | Promovido desde `metadata.channel_id`, mismo motivo |
| `total_tokens_used` | `INT` | |
| `total_cost_usd` | `NUMERIC` | |
| `metadata` | `JSONB` (opt) | Dict completo tal cual se recibió (incluye `source`/`channel_id`/`session_id`, aunque los dos primeros también vivan en columnas propias) |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | |

Índices: `bot_id`, `client_id`, `user_id`, `source`, `created_at`.

### `messages`

Tabla hija de `conversations` — reemplaza el array embebido `conversations.messages` que usaba Mongo (creado vía `$push`, sin límite ni índice propio).

| Campo | Tipo | Descripción |
|---|---|---|
| `message_id` | `BIGSERIAL PK` | No existía en Mongo (vivía embebido); autoincremental |
| `conversation_id` | `TEXT NOT NULL` → FK `conversations.conversation_id` `ON DELETE CASCADE` | |
| `role` | `TEXT` | `user` / `assistant` (`CHECK` constraint) |
| `content` | `TEXT` | |
| `timestamp` | `TIMESTAMPTZ` | |
| `metadata` | `JSONB` (opt) | Heterogéneo: a veces trae `tokens_used`/`estimated_cost_usd`/`model`/`rag_used`, a veces está vacío (flows, booking, subida de documentos) |

Índice: `(conversation_id, timestamp)` — permite reconstruir el orden de la conversación eficientemente (`ConversationService._messages_for`).

`ConversationService.get_conversation`/`get_all_conversations`/`get_user_conversations`/`get_latest_conversation_by_user` reconstruyen el array `messages` completo por conversación (join/subconsulta ordenada por `timestamp`) porque el contrato de API/frontend actual espera los mensajes embebidos en una sola respuesta — no hay paginación de mensajes hoy.

---


### `push_subscriptions`

Suscripciones push de clientes (PWA) y staff (app nativa). La misma tabla
soporta tres transportes: VAPID (web/PWA), FCM (Android), APNs (iOS).

| Campo | Tipo | Descripción |
|---|---|---|
| `subscription_id` | `TEXT PK` | |
| `bot_id` | `TEXT` → FK `bots.bot_id` `ON DELETE CASCADE` | |
| `channel_id` | `TEXT` (opt) → FK `channels.channel_id` | |
| `client_id` | `TEXT` (opt) → FK `clients.client_id` | Se completa cuando se vincula la suscripción a un cliente identificado |
| `user_id` | `TEXT` (opt) → FK `users.username` | **Nuevo.** Staff member dueño de esta suscripción (apps nativas staff). Mutuamente excluyente con `client_id`. |
| `platform` | `TEXT` | **Nuevo.** `vapid` (default, PWA web), `fcm` (Android nativo), `apns` (iOS nativo) |
| `endpoint` | `TEXT` (opt) | Endpoint push del navegador (solo VAPID). Unique donde no es null. |
| `p256dh` / `auth` | `TEXT` (opt) | Claves criptográficas (solo VAPID) |
| `device_token` | `TEXT` (opt) | **Nuevo.** Token de dispositivo para FCM o APNs. Unique parcial. |
| `user_agent` | `TEXT` (opt) | |
| `is_active` | `BOOLEAN` | |
| `created_at` / `last_used_at` | `TIMESTAMPTZ` (opt en `last_used_at`) | |
| `expiration_time` | `BIGINT` (opt) | Timestamp epoch ms de expiración, si aplica |

Índices: `bot_id`, `(bot_id, channel_id)`, `(bot_id, is_active)`, `client_id` parcial (`WHERE client_id IS NOT NULL`),
`user_id` parcial (`WHERE user_id IS NOT NULL`), `device_token` único parcial (`WHERE device_token IS NOT NULL`),
`endpoint` único parcial (`WHERE endpoint IS NOT NULL`).

**Routing de push:** `push_service.py` selecciona el transporte por `platform`:
- `vapid` → `pywebpush` con claves VAPID existentes
- `fcm` → Firebase Admin SDK (HTTP v1)
- `apns` → HTTP/2 a `api.push.apple.com` con JWT `apns-key`

**Registro desde la app nativa:** `POST /api/push/subscribe` acepta `platform: "fcm"|"apns"` +
`device_token` (en vez de `endpoint`+`keys`), más `user_id` para staff o `client_id` para clientes.
Si `user_id` viene poblado, `client_id` debe ser null y viceversa.
---

## ChromaDB (Knowledge Base)

ChromaDB almacena los embeddings de los documentos para RAG — no forma parte del esquema PostgreSQL descrito arriba, es un motor de vectores independiente. Es una única colección compartida por todos los bots, aislada por `bot_id` en la metadata de cada chunk (ver ADR-005 en `DECISIONS.md`).

**Collection:** `knowledge_base`

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | `{doc_id}_{chunk_index}` |
| `document` | string | Texto del chunk |
| `embedding` | vector float | Embedding generado (384 dimensiones) |
| `metadata.bot_id` | string | Bot al que pertenece el documento. Obligatorio en toda ingesta y usado como filtro `where` en toda búsqueda/listado/borrado. |
| `metadata.title` | string | Título del documento |
| `metadata.category` | string | Categoría |
| `metadata.doc_id` | string | ID del documento padre |
| `metadata.chunk_index` | int | Índice del chunk |
| `metadata.total_chunks` | int | Total de chunks del doc |

`RAGService.list_documents`, `delete_document`, `search` y `get_context`
(`backend/app/rag_service.py`) requieren `bot_id` y lo combinan con el resto
del filtro vía `where={"$and": [...]}`. No hay forma de consultar/borrar
documentos de otro bot sin conocer su `bot_id` exacto.

**Modelo de embeddings:** `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (384 dimensiones, multiidioma)

---

## Redis (rate limiting e idempotencia)

| Key pattern | TTL | Uso |
|---|---|---|
| `msg:{message_id}` | 86400s | Idempotencia de webhooks |
| `rate:{phone_or_chat_id}` | ventana configurable | Conteo de mensajes para rate limiting |
