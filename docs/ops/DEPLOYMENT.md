# DEPLOYMENT.md — Guía de Deploy

---

## Entornos

| Entorno | URL | Compose | Deploy |
|---|---|---|---|
| Development | http://localhost:8000 | `docker-compose.yml` | `docker compose up -d` |
| Production (API) | https://api.intellify.pro | `docker-compose.yml` + `docker-compose.prod.yml` | manual con aprobación |
| Production (panel admin) | https://admin.intellify.pro | `docker-compose.yml` + `docker-compose.prod.yml` | manual con aprobación |
| Production (tenants) | https://\<tenant\>.intellify.pro o dominio propio del cliente | + `docker-compose.tenants.prod.yml` | manual con aprobación, ver [Tenants con dominio propio](#tenants-con-dominio-propio) |

---

## Primera vez en producción

```bash
# 1. Conectar al servidor
ssh deploy@<IP_SERVIDOR>

# 2. Clonar repositorio
git clone <repo-url> /opt/app && cd /opt/app

# 3. Configurar variables de entorno de producción
cp backend/.env.example backend/.env.prod
nano backend/.env.prod  # completar ANTHROPIC_API_KEY, SECRET_KEY, VAPID_*, etc.

# 4. Build y levantar
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile traefik up -d --build

# 5. Verificar estado
docker compose ps
curl https://api.intellify.pro/api/health
curl -I https://admin.intellify.pro

# 6. Registrar webhooks de cada canal configurado contra
#    https://api.intellify.pro/api/webhook/... (ver docs/dev/SETUP.md)
```

---

## Deploy de actualización

```bash
ssh deploy@<IP_SERVIDOR>
cd /opt/app

# Pull cambios
git pull origin main

# Rebuild servicios modificados (el servicio del backend se llama "app", no "backend")
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile traefik up -d --build app frontend

# Verificar que todo levantó
docker compose ps
docker compose logs --tail=50 app
```

---

## Rollback

```bash
# Ver historial de imágenes Docker
docker images

# Volver a imagen anterior del backend (el servicio se llama "app", no "backend")
docker compose stop app
docker tag ${REGISTRY_IMAGE}/backend:previous ${REGISTRY_IMAGE}/backend:latest
docker compose up -d app
```

---

## Health checks

```bash
# Backend
curl https://api.intellify.pro/api/health

# Frontend (panel admin)
curl -I https://admin.intellify.pro

# Frontend (tenant)
curl -I https://ius.intellify.pro

# Estado de contenedores
docker compose ps

# Uso de recursos
docker stats
```

---

## Gestión de logs

```bash
# Logs del backend en tiempo real (el servicio se llama "app", no "backend")
docker compose logs -f app

# Últimas 100 líneas de todos los servicios
docker compose logs --tail=100

# Logs con timestamps
docker compose logs -f --timestamps app
```

---

## Comandos de mantenimiento

```bash
# Limpiar imágenes no usadas (liberar disco)
docker system prune -f

# Ver uso de disco de volúmenes
docker system df

# Reiniciar un servicio (el servicio se llama "app", no "backend")
docker compose restart app

# Acceder al shell del backend
docker compose exec app bash
```

---

## Variables de entorno en producción

Ver `ENV.md`. Las variables se setean en `backend/.env.prod` (no commiteado) y se pasan via Docker Compose.

Además de lo ya documentado en `ENV.md`, para la puesta en producción en
`intellify.pro` `backend/.env.prod` debe tener:

| Variable | Valor |
|---|---|
| `WEBHOOK_BASE_URL` | `https://api.intellify.pro` |
| `CORS_ORIGINS` | `https://admin.intellify.pro` |
| `FRONTEND_URL` | `https://admin.intellify.pro` |
| `GOOGLE_REDIRECT_URI` | `https://api.intellify.pro/api/v1/auth/google/callback` (debe coincidir con lo registrado en Google Cloud Console) |

No hace falta agregar subdominios de tenants (`ius.intellify.pro`, futuros
`*.intellify.pro` o dominios propios de clientes) a `CORS_ORIGINS`: el nginx
de `frontend-tenant/` proxea `/api/` y `/ws/` al backend server-side, así que
el browser nunca hace una llamada cross-origin a `api.intellify.pro` desde un
subdominio de tenant.

```bash
# Editar variables en producción
nano /opt/app/backend/.env.prod

# Recrear containers con nuevas variables (sin rebuild de imagen)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Ver `docker-compose.prod.yml` en la raíz del repositorio para la
configuración completa de Traefik/labels de `api.intellify.pro` (servicio
`app`) y `admin.intellify.pro` (servicio `frontend`).

---

## Tenants con dominio propio

Cada tenant con dominio propio (subdominio `*.intellify.pro` o dominio del
cliente) corre en su propio contenedor `frontend-tenant`, definido como un
service block en `docker-compose.tenants.prod.yml` — misma imagen para todos,
diferenciados por el env var `TENANT_ID` y por el `Host()` del label de
Traefik.

**Nuance de TLS**: el registro DNS wildcard `*.intellify.pro` es solo una
comodidad para no tener que crear un registro DNS por cada tenant nuevo. El
certresolver `letsencrypt` de Traefik en este servidor usa el challenge
TLS-ALPN (`acme.tlschallenge=true` en el servicio `traefik` embebido de
`docker-compose.yml`), no DNS-01, así que **no** emite certificados wildcard
— cada `Host()` concreto sigue necesitando su propio service block acá y
dispara su propia emisión de certificado la primera vez que recibe tráfico
HTTPS en el puerto 443.

### Levantar los tenants ya definidos

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  -f docker-compose.tenants.prod.yml up -d --build
```

### Dar de alta un tenant nuevo (subdominio `*.intellify.pro`)

1. Crear el tenant (plan, tenant, usuario admin, bot, canal, módulos) desde
   `https://admin.intellify.pro` y capturar el `tenant_id` devuelto.
2. Agregar `TENANT_ID_<SLUG>=<tenant_id>` a `.env` en el servidor.
3. Copiar un service block en `docker-compose.tenants.prod.yml`, renombrar
   `service key`/`container_name`, usar `TENANT_ID_<SLUG>` y
   `Host(\`<slug>.intellify.pro\`)`.
4. `docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.tenants.prod.yml up -d --build frontend-tenant-<slug>`

### Dar de alta un tenant con dominio propio del cliente

Mismo procedimiento, con dos diferencias: el cliente crea un registro DNS
(A/CNAME) apuntando a la IP de este servidor, y el `Host()` del label usa ese
dominio en vez de un subdominio de `intellify.pro`. No requiere ningún cambio
de código en `frontend-tenant/` ni en el backend — el proxy `/api/`+`/ws/` de
nginx y la resolución del `TENANT_ID` en runtime funcionan igual sin importar
la zona DNS del `Host()`.
