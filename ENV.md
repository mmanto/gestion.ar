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
| `EMBEDDING_MODEL` | ❌ | Modelo de embeddings RAG: ID de Hugging Face Hub o ruta local a un snapshot descargado. Default bakeado en la imagen Docker | `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` |
| `HF_HUB_OFFLINE` | ❌ | Fuerza modo offline de huggingface_hub (default `1` en la imagen; el modelo se descarga en build) | `1` |
| `TRANSFORMERS_OFFLINE` | ❌ | Fuerza modo offline de transformers (default `1` en la imagen) | `1` |

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
| `DEEPSEEK_MODEL` | ❌ | Modelo DeepSeek a usar | `deepseek-v4-flash` (default) / `deepseek-v4-pro` |
| `DEEPSEEK_BASE_URL` | ❌ | URL base de la API de DeepSeek | `https://api.deepseek.com` (default) |
| `DEEPSEEK_TIMEOUT` | ❌ | Timeout en segundos para DeepSeek | `90` (default) |
| `DEEPSEEK_THINKING` | ❌ | Habilita el modo "thinking" (razonamiento) de DeepSeek | `disabled` (default) / `enabled` |

> *Requerida según el `LLM_PROVIDER` elegido.
>
> Nota: `deepseek-chat`/`deepseek-reasoner` son alias legacy que DeepSeek da
> de baja el 2026-07-24 — usar `deepseek-v4-flash`/`deepseek-v4-pro`.

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

## Push Notifications Nativas (FCM / APNs)

Para apps nativas Android/iOS vía Capacitor (ver ADR-007 en `docs/dev/DECISIONS.md`).

| Variable | Requerida | Descripción | Ejemplo |
|---|---|---|---|
| `FCM_CREDENTIALS_PATH` | ✅* | Path al archivo JSON de credenciales de Firebase Admin SDK | `/app/firebase-credentials.json` |
| `APNS_KEY_PATH` | ✅* | Path al archivo .p8 de APNs Auth Key | `/app/apns-key.p8` |
| `APNS_KEY_ID` | ✅* | Key ID de la APNs Auth Key | `ABC1234567` |
| `APNS_TEAM_ID` | ✅* | Team ID de Apple Developer | `DEF7890123` |
| `APNS_TOPIC` | ✅* | Bundle ID de la app iOS | `ar.gestion.staff` |
| `APNS_USE_SANDBOX` | ❌ | Usar APNs sandbox (desarrollo) | `true` (default: `false`) |

> *Solo requeridas si se distribuyen apps nativas (Android/iOS).
> Las credenciales VAPID siguen siendo necesarias para la PWA web.
>
> **FCM:** Crear proyecto en Firebase Console → Project Settings → Service Accounts → Generate new private key.
> **APNs:** Crear Auth Key en Apple Developer → Keys → APNs Auth Key → descargar .p8.
---

## Login social (Google/Microsoft vía Nango self-hosted)

Nango custodia y refresca los tokens del proveedor — el backend nunca ve un
refresh token. El self-hosted de Nango vive aparte, en el repo
`devbout-oauth/deploy/nango` (proyecto Compose independiente, ver su propio
README), como **instancia compartida** entre las apps que consumen
`devbout-oauth` (gestion.ar, nexsure, ...), no vendorizada en cada una.

| Variable | Requerida | Descripción | Ejemplo |
|---|---|---|---|
| `NANGO_HOST` | ✅* | URL base de la API de Nango, vista por el **backend** | Docker: `http://nango-server:8080` (red externa `nango_network`) · sin Docker: `http://localhost:3003` |
| `NANGO_SECRET_KEY` | ✅* | Secret que autentica las llamadas backend → Nango | — |
| `NANGO_WEBHOOK_SECRET` | ⛔ opcional | Verifica que `/api/tenant/oauth/webhook/nango` venga de Nango — usado por el login OAuth nativo (mobile), que no puede depender del popup `postMessage` (ver `auth.service.ts`) | — |
| `STATE_SIGNING_KEY` | ✅* | Firma el login nonce (HS256) — separada de `JWT_SECRET_KEY` | `openssl rand -hex 32` |
| `FRONTEND_URL` | ✅* | URL base del frontend (para redirects post-OAuth) | `https://tudominio.com` |

> *Solo requeridas si se activa el login/alta social (admin general y/o
> tenants). Ver `VITE_NANGO_CONNECT_URL`/`VITE_NANGO_API_URL` más abajo para
> las URLs que usa el browser (distintas de `NANGO_HOST`, que es
> contenedor-a-contenedor).
>
> **`NANGO_SECRET_KEY` NO es el mismo valor que `NANGO_SECRET_KEY` en
> `deploy/nango/.env`** — ese env var no siembra el secret real. Nango
> genera uno random por environment (dashboard → Settings → Environment) la
> primera vez que te das de alta ahí; copiá ESE valor acá, no el del `.env`
> del deploy.
>
> Con Docker, `app` está unido a la red externa `nango_network`
> (`docker-compose.yml`), compartida con `devbout-oauth/deploy/nango` —
> se crea una sola vez con `docker network create nango_network`.
>
> Las integraciones Google/Microsoft (client id/secret, scopes) se
> configuran en el dashboard de Nango, no acá.
>
> **`NANGO_WEBHOOK_SECRET`**: en el login OAuth nativo (Android/iOS), el
> OAuth de Google corre en Chrome Custom Tabs (no en el WebView de la app),
> así que el popup no puede avisar por `window.opener.postMessage` como en
> web — el backend se entera por un webhook de Nango en su lugar. Paso
> manual, en el dashboard del Nango self-hosted: Environment Settings →
> Webhook URL = `<WEBHOOK_BASE_URL>/api/tenant/oauth/webhook/nango`, y
> copiar la Webhook Signing Key de esa misma pantalla acá (**no** es
> `NANGO_SECRET_KEY` — son secrets distintos). Sin esto seteado, el
> webhook igual funciona pero sin verificar firma (queda un warning en el
> log); dejarlo sin setear en dev es aceptable, no en prod.
>
> **Producción**: Connect UI y API de Nango necesitan ser alcanzables desde
> el browser de un usuario real (no solo desde la red Docker del servidor)
> — ver `devbout-oauth/deploy/nango/docker-compose.prod.yaml` para la
> exposición pública vía el Traefik compartido (`api.nango.<dominio>` /
> `nango.<dominio>`, con el dashboard detrás de BasicAuth y las rutas
> `/oauth`,`/connect`,`/connections`,`/environment` públicas sin auth).

---

## Mercado Pago (autoregistro "Crea tu cuenta")

| Variable | Requerida | Descripción | Ejemplo |
|---|---|---|---|
| `MP_LINK_MENSUAL` | ❌ | URL de suscripción de Mercado Pago del plan mensual (lo devuelve `POST /api/auth/register`) | `https://www.mercadopago.com.mx/subscriptions/XXXXX` |
| `MP_LINK_ANUAL` | ❌ | URL de suscripción de Mercado Pago del plan anual | `https://www.mercadopago.com.mx/subscriptions/YYYYY` |

> Sin configurar, caen al placeholder `.../REEMPLAZAR-LINK-*` (igual que la
> landing) — el flujo funciona pero el pago no se procesa hasta definir las
> URLs reales de suscripción.

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
| `VITE_NANGO_CONNECT_URL` | ❌* | URL de Nango Connect visible desde el browser | dev: `http://localhost:3009` · prod: `https://nango.tudominio.com` |
| `VITE_NANGO_API_URL` | ❌* | URL de la API de Nango visible desde el browser | dev: `http://localhost:3003` · prod: `https://api.nango.tudominio.com` |
| `VITE_APPOINTMENTS_REMOTE_URL` | ❌* | URL del remote de turnos (Module Federation, `devbout-appointments` — ver ADR-009). En dev web es el dev-server de `frontend-widgets`; en builds de Android (`scripts/stack-*.sh`) se inyecta una URL alcanzable desde el dispositivo (host del backend + `:8180`, o un túnel) | dev: `http://localhost:8180/remoteEntry.js` · prod: `https://appointments-widgets.intellify.pro/remoteEntry.js` |

> *Sin valor, caen al default hardcodeado de `auth.service.ts`
> (`localhost:3009`/`localhost:3003`), que no resuelve en producción. Son
> build args de Docker (`ARG`/`ENV` en `frontend/Dockerfile` y
> `frontend-tenant/Dockerfile`), no runtime — hay que pasarlos en
> `docker-compose.prod.yml`/`docker-compose.tenants.prod.yml`
> (`build.args`), no alcanza con setearlos en `.env.prod`.
>
> `VITE_APPOINTMENTS_REMOTE_URL` sin valor cae al fallback de `vite.config.ts`
> (la URL de prod), para que un build que no carga `.env.dev`/`.env.prod`
> (p.ej. `vite build --mode capacitor`) no hornee un `localhost` inalcanzable.
> Para apuntar un APK a un remote de dev, `scripts/stack-*.sh` derivan la URL
> desde el host del backend (`:8180`) u se puede sobreescribir exportando
> `VITE_APPOINTMENTS_REMOTE_URL` antes de ejecutarlos.

---

## Docker Compose / Registry (solo `.env.prod`)

| Variable | Requerida | Descripción | Ejemplo |
|---|---|---|---|
| `REGISTRY_IMAGE` | ✅ | Registry + namespace de las imágenes | `registry.gitlab.com/NAMESPACE/PROJECT` |
| `IMAGE_TAG` | ❌ | Tag a deployar (default `latest`) | `v1.2.3` |
| `TENANT_ID_IUS` | ❌ | Tenant ID por cada tenant con dominio propio (`docker-compose.tenants.prod.yml`) | `tenant_78f507331c18` |
| `TENANT_ID_PACHOTESAYUDA` | ❌ | Tenant ID del tenant pachoteayuda (dominio propio `pachoteayuda.ar`) | `tenant_2fc38a44e696` |
| `TENANT_APPID_<SLUG>` | ❌ | `applicationId` Android del APK del tenant (build-android en `scripts/stack-*.sh`) | `ius.intellify.pro` |
|| `TENANT_APPNAME_<SLUG>` | ❌ | Nombre visible del APK del tenant | `"ius"` |
| `TENANT_BRANDCOLOR_<SLUG>` | ❌ | Color de marca (splash + status bar) del APK del tenant | `#25357a` |
| `TENANT_PUBLIC_URL_<SLUG>` | ❌* | Dominio público del frontend web del tenant, horneado en el APK como `VITE_TENANT_PUBLIC_URL`. En la app nativa las llamadas van directo al backend (`VITE_API_URL`, ej. `api.intellify.pro`), así que `getPublicUrl()` no puede derivar el dominio del tenant del Host de la request — sin esto el link de chat ("Compartir", "Mi link de chat") apunta al dominio del API en vez del frontend del tenant. *Sin valor, el APK queda con la derivación por Host (rota en nativo; web no lo usa) | `https://ius.intellify.pro` |

---

## Notas de seguridad

- `SECRET_KEY` debe ser un string aleatorio de al menos 32 caracteres
- `ANTHROPIC_API_KEY`, `WHATSAPP_TOKEN` y `TELEGRAM_BOT_TOKEN` son credenciales sensibles: nunca subirlos a Git
- En producción, las variables se pasan via Docker Compose o variables de entorno del servidor, no via archivo `.env` commiteado
