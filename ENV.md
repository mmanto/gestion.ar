# ENV.md — Variables de entorno

Todas las variables de entorno requeridas por el proyecto (backend, frontend
y frontend-tenant comparten un único archivo por entorno).
Copiar `.env.example` (raíz del repo) a `.env.dev` o `.env.prod` y completar los valores.

> Nunca commitear archivos `.env.dev` / `.env.prod` con credenciales reales. Solo `.env.example`.

---

## Entorno general

| Variable | Requerida | Descripción | Ejemplo |
|---|---|---|---|
| `ENVIRONMENT` | ✅ | Entorno actual | `development` / `production` |
| `DEBUG` | ❌ | Modo debug | `true` / `false` |

---

## Base de datos

Postgres es la base de datos principal (ver ADR-006). `DB_NAME`/`DB_USER`/`DB_PASSWORD`
se usan para sustituir `${...}` dentro de `docker-compose.yml`/`docker-compose.prod.yml`
(arman `DATABASE_URL` ahí mismo, no hace falta setear `DATABASE_URL` a mano).

| Variable | Requerida | Descripción | Ejemplo |
|---|---|---|---|
| `DB_NAME` | ✅ | Nombre de la base Postgres | `gestionar` |
| `DB_USER` | ✅ | Usuario Postgres | `gestionar_user` |
| `DB_PASSWORD` | ✅ | Password Postgres | — |
| `REDIS_URL` | ✅ | URL de conexión Redis | `redis://redis:6379` |
| `CHROMA_PATH` | ✅ | Path de ChromaDB dentro del contenedor | `/app/chroma_db` |

> En Docker, usar nombres de servicios (`postgres`, `redis`) en lugar de `localhost`.
> Postgres se expone en el host en el puerto `5433` para evitar colisiones. Redis en `6380`.

---

## LLM (Anthropic / Ollama / DeepSeek)

| Variable | Requerida | Descripción | Ejemplo |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | ✅* | API key de Anthropic | `sk-ant-api03-xxx` |
| `CLAUDE_MODEL` | ❌ | Modelo Claude a usar | `claude-haiku-4-5-20251001` |
| `LLM_PROVIDER` | ❌ | Proveedor de LLM | `claude` (default) / `ollama` / `deepseek` |
| `OLLAMA_BASE_URL` | ✅* | URL de Ollama (si LLM_PROVIDER=ollama) | `http://ollama:11434` |
| `OLLAMA_MODEL` | ❌ | Modelo Ollama a usar | `qcwind/qwen3-8b-instruct-Q4-K-M:latest` |
| `OLLAMA_TIMEOUT` | ❌ | Timeout en segundos para Ollama | `120` |
| `DEEPSEEK_API_KEY` | ✅* | API key de DeepSeek (si LLM_PROVIDER=deepseek) | `sk-xxx` |
| `DEEPSEEK_MODEL` | ❌ | Modelo DeepSeek a usar | `deepseek-chat` (default) / `deepseek-reasoner` |
| `DEEPSEEK_BASE_URL` | ❌ | URL base de la API de DeepSeek | `https://api.deepseek.com` (default) |
| `DEEPSEEK_TIMEOUT` | ❌ | Timeout en segundos para DeepSeek | `90` (default) |

> *Requerida según el `LLM_PROVIDER` elegido.

---

## Autenticación / JWT

| Variable | Requerida | Descripción | Ejemplo |
|---|---|---|---|
| `SECRET_KEY` | ✅ | Clave para firmar tokens JWT | `openssl rand -hex 32` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | ❌ | Expiración del token (default: 30) | `60` |

---

## WhatsApp Business API

| Variable | Requerida | Descripción | Ejemplo |
|---|---|---|---|
| `WHATSAPP_TOKEN` | ✅* | Token de acceso de la API | `EAARxxx` |
| `WHATSAPP_PHONE_ID` | ✅* | ID del número de WhatsApp Business | `820406601151491` |
| `WEBHOOK_VERIFY_TOKEN` | ✅* | Token para verificar webhooks | `mi_token_secreto` |
| `WHATSAPP_APP_SECRET` | ❌ | App Secret para verificar firmas de webhook | `abc123` |

> *Solo requeridas si se usa el canal WhatsApp (Meta Cloud API).
> Para Twilio, las credenciales se configuran por canal en la base de datos (no en .env).

---

## Telegram

| Variable | Requerida | Descripción | Ejemplo |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅* | Token del bot de Telegram | `1234567890:ABCdef` |
| `TELEGRAM_WEBHOOK_SECRET` | ✅* | Secret para validar webhooks | `openssl rand -hex 32` |

> *Solo requeridas si se usa el canal Telegram.

---

## PWA / Push Notifications (VAPID)

| Variable | Requerida | Descripción | Ejemplo |
|---|---|---|---|
| `VAPID_PRIVATE_KEY` | ✅* | Clave privada VAPID | (ver scripts/generate_vapid_keys.sh) |
| `VAPID_PUBLIC_KEY` | ✅* | Clave pública VAPID (se expone al frontend) | (ver scripts/generate_vapid_keys.sh) |
| `VAPID_SUBJECT` | ✅* | Identificador VAPID | `mailto:admin@example.com` |

> *Solo requeridas si se usa el canal PWA con push notifications.
> Generar claves con: `scripts/generate_vapid_keys.sh`

---

## Google OAuth

| Variable | Requerida | Descripción | Ejemplo |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | ✅* | Client ID de la app en Google Cloud Console | `771897...apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | ✅* | Client Secret | `GOCSPX-...` |
| `GOOGLE_REDIRECT_URI` | ✅* | URI de callback registrada en Google Cloud Console | `https://api.tudominio.com/api/v1/auth/google/callback` |
| `FRONTEND_URL` | ✅* | URL base del frontend (para redirects post-OAuth) | `https://tudominio.com` |
| `ENCRYPTION_KEY` | ✅* | Clave Fernet para encriptar refresh tokens en MongoDB | `openssl rand -hex 32` |
| `GOOGLE_STATE_SIGNING_KEY` | ❌ | Clave HMAC para firmar el state JWT (default: `ENCRYPTION_KEY`) | `openssl rand -hex 32` |

> *Solo requeridas si se activa el flujo Google OAuth (Login con Google / Gmail Connect).
>
> Crear credenciales en https://console.cloud.google.com/apis/credentials → **OAuth 2.0 Client IDs** → tipo **Web application**.
> Agregar `GOOGLE_REDIRECT_URI` en "Authorized redirect URIs" y `FRONTEND_URL` en "Authorized JavaScript origins".

---

## URLs públicas

| Variable | Requerida | Descripción | Ejemplo |
|---|---|---|---|
| `WEBHOOK_BASE_URL` | ✅ | URL pública del **backend** (callbacks de WhatsApp/Telegram) | `https://api.tudominio.com` |
| `FRONTEND_URL` | ✅ | URL pública del **frontend** (link de chat, redirects OAuth) | `https://tudominio.com` |

> Son dominios distintos en producción. Confundirlos rompe el botón "Copiar link" del detalle del agente y los redirects de OAuth.

---

## Frontend (Vite)

Variables con prefijo `VITE_` son expuestas al cliente. `frontend/` y
`frontend-tenant/` leen el mismo archivo (`envDir` apunta a la raíz del
repo), por eso el nombre de marca tiene una clave por app.

| Variable | Requerida | Descripción | Ejemplo |
|---|---|---|---|
| `VITE_API_URL` | ✅ | URL base del backend (misma para ambas apps) | `http://localhost:8000` / `/api` |
| `VITE_APP_NAME` | ❌ | Nombre de marca de `frontend/` (panel admin) | `Asistente` |
| `VITE_TENANT_APP_NAME` | ❌ | Nombre de marca de `frontend-tenant/` | `Backoffice` |
| `VITE_NANGO_CONNECT_URL` | ❌ | URL de Nango Connect visible desde el browser | `http://localhost:3009` |
| `VITE_NANGO_API_URL` | ❌ | URL de la API de Nango visible desde el browser | `http://localhost:3003` |

---

## Docker Compose / Registry (solo `.env.prod`)

| Variable | Requerida | Descripción | Ejemplo |
|---|---|---|---|
| `REGISTRY_IMAGE` | ✅ | Registry + namespace de las imágenes | `registry.gitlab.com/NAMESPACE/PROJECT` |
| `IMAGE_TAG` | ❌ | Tag a deployar (default `latest`) | `v1.2.3` |
| `TENANT_ID_IUS` | ❌ | Tenant ID por cada tenant con dominio propio (`docker-compose.tenants.prod.yml`) | `tenant_78f507331c18` |

---

## Notas de seguridad

- `SECRET_KEY` debe ser un string aleatorio de al menos 32 caracteres
- `ANTHROPIC_API_KEY`, `WHATSAPP_TOKEN` y `TELEGRAM_BOT_TOKEN` son credenciales sensibles: nunca subirlos a Git
- En producción, las variables se pasan via Docker Compose o variables de entorno del servidor, no via archivo `.env` commiteado
