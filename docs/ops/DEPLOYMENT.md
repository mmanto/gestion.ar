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
cp .env.example .env.prod
nano .env.prod  # completar ANTHROPIC_API_KEY, SECRET_KEY, DB_USER, DB_PASSWORD, VAPID_*, etc.

# 4. Build y levantar
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build

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
cd /opt/gestion.ar
./deploy.sh
```

`deploy.sh` hace `git pull` + `docker compose --env-file .env.prod -f
docker-compose.yml -f docker-compose.prod.yml up -d --build` + health check
de `api.intellify.pro` y `admin.intellify.pro`. Existe porque un deploy
manual sin los dos `-f` (solo `docker-compose.yml`, sin el override de prod)
rompió producción varias veces: sin `docker-compose.prod.yml` los
contenedores levantan con los labels de Traefik viejos (o sin ninguno) y con
`.env.dev` en vez de `.env.prod` — **usar siempre `./deploy.sh`, no el
comando de `docker compose` a mano.**

Para debug manual puntual (rebuild de un solo servicio, por ejemplo), el
comando completo sigue siendo (nunca omitir `--env-file .env.prod`: sin él,
Docker Compose no sustituye `${REGISTRY_IMAGE}`/`${DB_USER}`/etc. del YAML):

```bash
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build app frontend
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml ps
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml logs --tail=50 app
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

Ver `ENV.md`. Las variables se setean en `.env.prod` (raíz del repo, no commiteado) y se pasan via Docker Compose.

Además de lo ya documentado en `ENV.md`, para la puesta en producción en
`intellify.pro` `.env.prod` debe tener:

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
nano /opt/app/.env.prod

# Recrear containers con nuevas variables (sin rebuild de imagen)
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d
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

**El Traefik de este servidor es el standalone de `infra/traefik/`** (container
`traefik`, no el servicio embebido con perfil de `docker-compose.yml`) — es
compartido con otros proyectos del mismo host (`cooperschol`, `insurance-api`).
**Nunca levantar el servicio `traefik` embebido acá** (`docker compose ...
--profile traefik up`): compite por los puertos 80/443 con el standalone y
rompe el routing de todos los proyectos del servidor, no solo de este.

**Nuance de TLS**: el registro DNS wildcard `*.intellify.pro` es solo una
comodidad para no tener que crear un registro DNS por cada tenant nuevo. El
certresolver `letsencrypt` de este Traefik usa TLS-ALPN-01
(`acme.tlschallenge=true`, ver `infra/traefik/docker-compose.yml`; antes
HTTP-01 en `entrypoints.web`, que con el redirect global HTTP→HTTPS no
autorizaba hosts nuevos — ver `docs/ops/RUNBOOK.md`),
no DNS-01, así que **no** emite certificados wildcard — cada `Host()` concreto
sigue necesitando su propio service block acá y dispara su propia emisión de
certificado la primera vez que recibe tráfico HTTP/HTTPS.

### Levantar los tenants ya definidos

```bash
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml \
  -f docker-compose.tenants.prod.yml up -d --build
```

### Dar de alta un tenant nuevo (subdominio `*.intellify.pro`)

1. Crear el tenant (plan, tenant, usuario admin, bot, canal, módulos) desde
   `https://admin.intellify.pro` y capturar el `tenant_id` devuelto.
2. Agregar `TENANT_ID_<SLUG>=<tenant_id>` a `.env.prod` en el servidor.
3. Copiar un service block en `docker-compose.tenants.prod.yml`, renombrar
   `service key`/`container_name`, usar `TENANT_ID_<SLUG>` y
   `Host(\`<slug>.intellify.pro\`)`.
4. `docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.tenants.prod.yml up -d --build frontend-tenant-<slug>`

### Dar de alta un tenant con dominio propio del cliente

Mismo procedimiento, con dos diferencias: el cliente crea un registro DNS
(A/CNAME) apuntando a la IP de este servidor, y el `Host()` del label usa ese
dominio en vez de un subdominio de `intellify.pro`. No requiere ningún cambio
de código en `frontend-tenant/` ni en el backend — el proxy `/api/`+`/ws/` de
nginx y la resolución del `TENANT_ID` en runtime funcionan igual sin importar
la zona DNS del `Host()`.

### Tenants con dominio propio activos

| Slug | Dominio | Script de BD |
|---|---|---|
| erma | erma.com.ar | `backend/scripts/create_erma_tenant.py` |
| pachoteayuda | pachoteayuda.ar | `backend/scripts/create_pachoteayuda_tenant.py` |
| ipachoteayuda | pachoteayuda.intellify.pro | `backend/scripts/create_ipachoteayuda_tenant.py` |
| openpadel | openpadel.pro | `backend/scripts/create_openpadel_tenant.py` |

**openpadel.pro — deploy inicial:**

```bash
# Prerrequisito: el cliente apunta openpadel.pro (registro A) a la IP del servidor.

# 1. Crear el tenant en la BD (desde el servidor):
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml \
  exec app python scripts/create_openpadel_tenant.py
#   → Copiar el TENANT_ID_OPENPADEL impreso al .env.prod

# 2. Levantar los containers:
docker compose --env-file .env.prod \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.tenants.prod.yml \
  up -d --build frontend-tenant-openpadel landing-openpadel

# 3. Verificar:
curl -I https://openpadel.pro          # debe redirigir a HTTPS y devolver 200
curl -I https://openpadel.pro/login    # debe llegar al SPA del tenant
```
