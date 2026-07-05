# ENV.md — Variables de entorno

Todas las variables de entorno requeridas por el proyecto.
Copiar `backend/.env.example` a `backend/.env.dev` o `backend/.env.prod` y completar los valores.

> Nunca commitear archivos `.env` con credenciales reales. Solo `.env.example`.

---

## Entorno general

| Variable | Requerida | Descripción | Ejemplo |
|---|---|---|---|
| `ENVIRONMENT` | ✅ | Entorno actual | `development` / `production` |
| `DEBUG` | ❌ | Modo debug | `true` / `false` |

---

## Base de datos

| Variable | Requerida | Descripción | Ejemplo |
|---|---|---|---|
| `MONGODB_URI` | ✅ | URL de conexión MongoDB | `mongodb://mongo:27017/gestionar_dev` |
| `REDIS_URL` | ✅ | URL de conexión Redis | `redis://redis:6379` |
| `CHROMA_PATH` | ✅ | Path de ChromaDB dentro del contenedor | `/app/chroma_db` |

> En Docker, usar nombres de servicios (`mongo`, `redis`) en lugar de `localhost`.
> MongoDB se expone en el host en el puerto `27018` para evitar colisiones. Redis en `6380`.

---

## LLM (Anthropic / Ollama)

| Variable | Requerida | Descripción | Ejemplo |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | ✅* | API key de Anthropic | `sk-ant-api03-xxx` |
| `CLAUDE_MODEL` | ❌ | Modelo Claude a usar | `claude-haiku-4-5-20251001` |
| `LLM_PROVIDER` | ❌ | Proveedor de LLM | `claude` (default) / `ollama` |
| `OLLAMA_BASE_URL` | ✅* | URL de Ollama (si LLM_PROVIDER=ollama) | `http://ollama:11434` |

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

## Frontend (Vite)

Variables con prefijo `VITE_` son expuestas al cliente.

| Variable | Requerida | Descripción | Ejemplo |
|---|---|---|---|
| `VITE_API_URL` | ✅ | URL base del backend | `http://localhost:8000` |

---

## Notas de seguridad

- `SECRET_KEY` debe ser un string aleatorio de al menos 32 caracteres
- `ANTHROPIC_API_KEY`, `WHATSAPP_TOKEN` y `TELEGRAM_BOT_TOKEN` son credenciales sensibles: nunca subirlos a Git
- En producción, las variables se pasan via Docker Compose o variables de entorno del servidor, no via archivo `.env` commiteado
