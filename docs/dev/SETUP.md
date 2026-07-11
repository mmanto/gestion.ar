# SETUP.md — Configuración del entorno de desarrollo

---

## Requisitos

- Docker Engine 24+ y Docker Compose v2
- Node.js 20+ (solo para desarrollo del frontend sin Docker)
- Python 3.11+ (solo para desarrollo del backend sin Docker)

---

## Inicio rápido con Docker (recomendado)

```bash
# 1. Clonar y entrar al proyecto
git clone <repo-url>
cd gestion.ar

# 2. Configurar variables de entorno (un solo archivo en la raíz para todo:
#    backend, frontend y frontend-tenant)
cp .env.example .env.dev
# Editar .env.dev con las credenciales reales (ver ENV.md)

# 3. Levantar servicios de desarrollo
docker compose up -d

# 4. Verificar que todo esté corriendo
docker compose ps
curl http://localhost:8000/api/health
```

> Postgres queda accesible en el host en el puerto `5433`. Redis en `6380` (para evitar colisiones con instancias locales).

---

## Desarrollo sin Docker

Backend y frontend leen el mismo `.env.dev` de la raíz del repo (el backend vía
`python-dotenv`/env del shell, el frontend vía `envDir` en `vite.config.ts`).

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt

# Cargar variables desde la raíz del repo
cd ..
set -a; source .env.dev; set +a

# Levantar servidor de desarrollo
cd backend
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173 — lee .env.dev de la raíz automáticamente
```

---

## Configuración de canales de mensajería

Para recibir mensajes de canales externos (WhatsApp, Telegram) en desarrollo local, el backend necesita ser accesible desde internet. Usá un túnel HTTP.

### Opción A: ngrok (recomendado para desarrollo)

```bash
# Instalar ngrok y autenticarse (ngrok.com)
ngrok config add-authtoken TU_TOKEN

# Exponer el backend
ngrok http 8000
# Copiá la URL HTTPS generada (ej: https://abc123.ngrok-free.app)
```

### Opción B: Cloudflare Tunnel (gratis, URL permanente)

```bash
cloudflared tunnel login
cloudflared tunnel create gestion-ar
cloudflared tunnel --url http://localhost:8000
```

### Opción C: localhost.run (sin instalación)

```bash
ssh -R 80:localhost:8000 localhost.run
# La URL cambia en cada reinicio
```

---

## Configurar webhook de WhatsApp (Meta Cloud API)

1. Obtener la URL pública del backend (ej: `https://abc123.ngrok-free.app`)
2. Ir a [Meta for Developers](https://developers.facebook.com/) → tu app → WhatsApp → Configuration
3. En la sección **Webhook**, hacer clic en **Edit**:
   - **Callback URL:** `https://abc123.ngrok-free.app/api/webhook/whatsapp/meta/{channel_id}`
   - **Verify Token:** valor de `WEBHOOK_VERIFY_TOKEN` en `.env.dev`
4. Hacer clic en **Verify and Save**
5. Suscribirse al campo `messages`

> El `channel_id` se obtiene al crear el canal via API o desde el dashboard.

### Verificar webhook

```bash
curl "https://TU-URL/api/webhook/whatsapp/meta/CHANNEL_ID?hub.mode=subscribe&hub.verify_token=TU_TOKEN&hub.challenge=test"
# Debe responder: test
```

---

## Configurar webhook de Telegram

```bash
# Reemplazar TOKEN y URL con tus valores
curl -X POST "https://api.telegram.org/botTU_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://TU-URL/api/webhook/telegram/CHANNEL_ID",
    "secret_token": "TU_TELEGRAM_WEBHOOK_SECRET",
    "allowed_updates": ["message"]
  }'
```

### Verificar webhook de Telegram

```bash
curl "https://api.telegram.org/botTU_TOKEN/getWebhookInfo"
```

---

## Configurar push notifications VAPID

```bash
# Generar claves VAPID
scripts/generate_vapid_keys.sh
# Copiar VAPID_PRIVATE_KEY y VAPID_PUBLIC_KEY al .env.dev
```

---

## Comandos útiles de desarrollo

```bash
# Ver logs del backend en tiempo real
docker compose logs -f backend

# Ver logs de todos los servicios
docker compose logs -f

# Reiniciar solo el backend
docker compose restart backend

# Acceder a MongoDB
mongosh mongodb://localhost:27018/gestionar_dev

# Acceder a Redis
redis-cli -p 6380

# Ejecutar tests del backend
docker compose exec backend pytest

# Limpiar la base de conocimiento RAG (ChromaDB)
curl -X DELETE http://localhost:8000/api/rag/clear

# Ver estadísticas de RAG
curl http://localhost:8000/api/rag/stats
```

---

## Variables de entorno

Ver `ENV.md` en la raíz del proyecto para la lista completa y descripción de cada variable.
