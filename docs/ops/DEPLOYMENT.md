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
ssh mmanto@<IP_SERVIDOR>
cd /opt/gestion.ar
git pull
make prod-rebuild     # = docker compose up -d --build de los 6 servicios
```

`make` es la única entrada al stack (convención DevBout): los targets `prod-*`
cargan `.env.prod` y los **tres** compose files (`docker-compose.yml` +
`docker-compose.prod.yml` + `docker-compose.tenants.prod.yml`) y aíslan las
variables del host. `make prod-rebuild` es `up -d --build`; `make prod-up`
levanta sin reconstruir imágenes (útil cuando las imágenes ya están al día).
`make prod-check` valida `.env.prod` y `REGISTRY_IMAGE` antes de tocar Docker.
Existe porque un deploy manual sin los `-f` correctos rompió producción varias
veces: sin `docker-compose.prod.yml` los contenedores levantan con los labels
de Traefik viejos (o sin ninguno) y con `.env.dev` en vez de `.env.prod`, y sin
`docker-compose.tenants.prod.yml` **no se levantan los tenants ni las
landings** (`frontend-tenant`, `landing`) — **usar siempre `make prod-*`, no
el comando de `docker compose` a mano.**

Verificar después del deploy:

```bash
make prod-status      # ps + health check de api, admin y cada tenant
```

> `./deploy.sh` (nombre viejo, borrado en el commit `93c8f0d`) ya no existe:
> si un doc o un runbook lo menciona, el reemplazo es `make prod-rebuild`.
>
> **Build de prod (ADR-036):** `app` instala torch CPU (no CUDA) y cachea
> apt/pip; el modelo de embeddings se bakea con `timeout 180` y, si falla,
> la imagen se construye igual (runtime con `EMBEDDING_MODEL` o
> `/opt/models/embedding-model`). La primera build en un VPS limpio descarga
> las ruedas y el modelo; las siguientes reutilizan capas. `make prod-build`
> construye sin levantar.

Para debug manual puntual (rebuild de un solo servicio, por ejemplo), el
comando completo sigue siendo (nunca omitir `--env-file .env.prod`: sin él,
Docker Compose no sustituye `${REGISTRY_IMAGE}`/`${DB_USER}`/etc. del YAML):

```bash
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build app frontend
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml ps
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml logs --tail=50 app
```

---

## El build falla por red del VPS

Los dos targets que bajan paquetes de internet fallan con mensajes que no
señalan la causa. En ambos casos el problema es el mismo: el server no llega
bien a `registry.npmjs.org` / `deb.debian.org`.

### `frontend` / `frontend-tenant`: `npm error Exit handler never called!`

No es el código ni el lockfile. Es el bug de npm 10.x/11.x en `agent-base`
(npm/cli#9386): npm abre 15 conexiones (`maxsockets`) y encola el resto; si
una conexión contra el registry falla, las encoladas nunca arrancan, npm se
queda sin event loop y muere con ese mensaje genérico **sin imprimir el error
de red real**.

Los Dockerfiles de `frontend/` y `frontend-tenant/` ya lo mitigan
(`npm ci --maxsockets 1000 --no-audit --no-fund` +
`NPM_CONFIG_FETCH_RETRIES=5`), así que el build ahora falla mostrando el error
verdadero. Si aparece un `ETIMEDOUT`/`ENOTFOUND`, ver las comprobaciones de
abajo.

### `app`: `apt-get … did not complete successfully: exit code: 100`

`apt-get` sale con 100 ante cualquier error de fetch, y Docker sólo muestra el
`/bin/sh -c apt-get …`. El motivo está en las líneas de `E:` inmediatamente
arriba del cierre:

| Línea `E:` | Causa |
|---|---|
| `Temporary failure resolving 'deb.debian.org'` | DNS roto en el host |
| `Release file … is not valid yet` / `has expired` | reloj del VPS desfasado (`date -u`) |
| `No space left on device` | disco lleno (`df -h /var/lib/docker`) |
| `Hash Sum mismatch` / `Writing more data` | proxy/caché intermedio, o descarga cortada |

El Dockerfile de `backend/` ya reintenta (`apt-get -o Acquire::Retries=5`).

### Comprobaciones en el server

```bash
# 1) host vs. contenedor: si el host resuelve y el build no, el DNS roto es el
#    del daemon de Docker (no el del VPS)
getent hosts deb.debian.org registry.npmjs.org
docker run --rm python:3.13-slim getent hosts deb.debian.org

# 2) el error de apt sin el wrapper de BuildKit
docker run --rm python:3.13-slim sh -c 'apt-get update 2>&1 | tail -15'

# 3) red, reloj, disco, proxy/MTU
curl -sS -o /dev/null -w '%{http_code} %{time_total}s\n' https://registry.npmjs.org/react
date -u; timedatectl status | head -3
df -h /var/lib/docker; df -i /var/lib/docker
env | grep -i _proxy; ip link show | grep -o 'mtu [0-9]*'
```

- **Host resuelve, contenedor no** → DNS del daemon. Se arregla por build con
  `--network=host` (usa la red del host, sin tocar el daemon):
  `docker build --network=host -t "$REGISTRY_IMAGE/backend:latest" backend/`
  (ídem `frontend/`, `frontend-tenant/`), después `make prod-up` sin
  `--build`. Alternativa permanente: `/etc/docker/daemon.json` con
  `{"dns": ["1.1.1.1", "8.8.8.8"]}` + `systemctl restart docker` (reiniciar el
  daemon recrea el stack).
- **Ninguno de los dos resuelve** → DNS del VPS (`cat /etc/resolv.conf`).
- Reloj desfasado → `timedatectl set-ntp true`.
- Sin salida a internet → buildear en otra máquina y publicar
  `${REGISTRY_IMAGE}/frontend:${IMAGE_TAG}` y `${REGISTRY_IMAGE}/backend:…`
  (compose levanta sin `--build`), o abrir la salida.
- `ETIMEDOUT` intermitente → red inestable: reintentar el build (npm y apt ya
  reintentan) y revisar MTU si hay VPN.
- Si aun así aparece `Exit handler never called!`, el `docker build` está
  cacheado: `--no-cache` en el target (`frontend`, `frontend-tenant` o `app`).

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

Todos los tenants (subdominio `*.intellify.pro` o dominio propio del cliente)
corren en **2 contenedores fijos**: `frontend-tenant` (SPA de todos) y `landing`
(todas las landings). El tenant y el sitio se resuelven por el `Host` de la
request — `frontend-tenant` contra `tenants.domain` (endpoint
`GET /api/public/tenants/current`) y `landing` contra el `map $http_host
$landing_root` de `sites/nginx.conf`. No hay `TENANT_ID` por contenedor ni
service block por tenant: un tenant nuevo se agrega con un router `Host()` de
Traefik (label), no con un contenedor. Ver ADR-027 en `docs/dev/DECISIONS.md`.

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
sigue necesitando su propio router (label) acá y dispara su propia emisión de
certificado la primera vez que recibe tráfico HTTP/HTTPS.

### Cutover al colapso (una sola vez)

Al pasar de "un contenedor por tenant" a los 2 compartidos hay que, en este
orden, **antes** de levantar `frontend-tenant`/`landing`:

```bash
cd /opt/gestion.ar

# 1. Migración: agrega tenants.settings (JSONB)
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml \
  exec app alembic upgrade head

# 2. Backfill: setea tenants.domain al host real de cada tenant (y settings de ius)
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml \
  exec app python scripts/backfill_tenant_domains.py
#   → Verificar que imprime un ✓ por tenant (ius, laboralia, proptech, erma,
#     pachoteayuda, openpadel). Si algún tenant no aparece por nombre, setearle
#     `domain` a mano en el panel admin (admin.intellify.pro).
```

Sin el `domain` correcto, el SPA devuelve 404 de "tenant no encontrado" (la
resolución por Host falla). La fuente de verdad de cada `domain` es el `Host()`
de su router en `docker-compose.tenants.prod.yml`.

### Levantar los tenants

```bash
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml \
  -f docker-compose.tenants.prod.yml up -d --build frontend-tenant landing
```

### Dar de alta un tenant nuevo (subdominio `*.intellify.pro`)

1. Crear el tenant (plan, tenant, usuario admin, bot, canal, módulos) desde
   `https://admin.intellify.pro`. Asegurarse de setear `domain` al host real
   (`<slug>.intellify.pro`) — es lo que usa la resolución por Host.
2. Agregar el router `tenant-<slug>` al servicio `frontend-tenant` de
   `docker-compose.tenants.prod.yml` (un bloque de labels `Host(\`<slug>.intellify.pro\`)`,
   `entrypoints=websecure`, `tls.certresolver=letsencrypt`, `priority=1`,
   `loadbalancer.server.port=80`). Sin contenedor nuevo.
3. Si el tenant tiene landing, copiar su directorio en `sites/Dockerfile`, agregar
   su línea al `map` de `sites/nginx.conf` y su router `landing-<slug>` (priority 10).
4. `docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.tenants.prod.yml up -d --build frontend-tenant landing`

### Dar de alta un tenant con dominio propio del cliente

Mismo procedimiento, con dos diferencias: el cliente crea un registro DNS
(A/CNAME) apuntando a la IP de este servidor, y el `domain` + el `Host()` usan
ese dominio en vez de un subdominio de `intellify.pro`. No requiere ningún
cambio de código — la resolución por Host funciona igual sin importar la zona
DNS del `Host()`.

### Tenants con dominio propio activos

| Slug | Dominio (`tenants.domain`) | Script de alta en BD |
|---|---|---|
| ius | ius.intellify.pro | (panel admin) |
| laboralia | laboralia.intellify.pro | (panel admin) |
| proptech | proptech.intellify.pro | (panel admin) |
| erma | erma.com.ar | `backend/scripts/create_erma_tenant.py` |
| pachoteayuda | pachoteayuda.ar | `backend/scripts/create_pachoteayuda_tenant.py` |
| openpadel | openpadel.pro | `backend/scripts/create_openpadel_tenant.py` |


El tenant ipachoteayuda (`pachoteayuda.intellify.pro`) fue eliminado de la
infraestructura; su fila de DB se quita con
`backend/scripts/remove_ipachoteayuda_tenant.py` — solo queda el dominio del
cliente `pachoteayuda.ar`.

### Landing de pachoteayuda: generar las páginas antes del build

El servicio `landing` no sirve una sola página para pachoteayuda: además del
`index.html` atiende `/normas/…` (una página por norma del HCD de Bolívar),
`/tramites/`, `/residuos/` (la grilla de recolección de residuos de Bolívar
Verde, ver ADR-020), `/reclamos/` (el mapa de reclamos de los vecinos, que se
cargan marcando el punto — página escrita a mano y **sí** versionada, ver
ADR-033), el `sitemap.xml` y sus assets en
`/landing/`. Salvo `/reclamos/`, nada de eso se versiona — lo genera
`scripts/generate_pachoteayuda_pages.py`, y el `COPY`
de `pachoteayuda-landing/` en `sites/Dockerfile` falla si no se corrió (a
propósito: mejor un build roto que un sitio publicado a medias).

En el VPS, antes de rebuildear el servicio:

```bash
cd /opt/gestion.ar

# El corpus JSONL viaja desde la máquina de trabajo (es el mismo que indexa el
# RAG — ver RUNBOOK.md § normas):
#   scp ~/workspace/bolivar/normas_corpus.jsonl mmanto@<VPS>:/tmp/
python3 scripts/generate_pachoteayuda_pages.py --corpus /tmp/normas_corpus.jsonl
#   3.861 páginas de norma + 9 de trámites + 5 de residuos + hubs + sitemap.xml —
#   ~15 s, sólo stdlib. Los trámites y la grilla de residuos se leen en vivo de
#   bolivar.gob.ar: este paso necesita salida a internet.

docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml \
  -f docker-compose.tenants.prod.yml up -d --build landing
```

Verificación (el router de la landing sólo matchea `/`, `*.html`, `/robots.txt`,
`/sitemap.xml`, `/landing/`, `/normas/`, `/tramites/`, `/residuos/` y
`/reclamos/`; todo lo demás cae en el SPA del tenant — ver INFRASTRUCTURE.md):

```bash
curl -sI https://pachoteayuda.ar/robots.txt | head -1   # 200 text/plain
curl -s  https://pachoteayuda.ar/sitemap.xml | head -3  # <urlset …>
curl -sI https://pachoteayuda.ar/normas/ | head -1      # 200
curl -sI https://pachoteayuda.ar/residuos/ | head -1    # 200
curl -sI https://pachoteayuda.ar/reclamos/ | head -1    # 200
curl -sI https://pachoteayuda.ar/login   | head -1      # 200 (SPA del tenant)
```

**openpadel.pro — deploy inicial:**

```bash
# Prerrequisito: el cliente apunta openpadel.pro (registro A) a la IP del servidor.

# 1. Crear el tenant en la BD (desde el servidor). El script setea
#    domain=openpadel.pro, así que la resolución por Host ya funciona.
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml \
  exec app python scripts/create_openpadel_tenant.py
#   → (opcional) copiar TENANT_ID_OPENPADEL al .env.prod SOLO si se va a
#     buildear el APK nativo (make prod-build-android); el web no lo usa.

# 2. Levantar los 2 contenedores compartidos (los routers ya están en compose):
docker compose --env-file .env.prod \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.tenants.prod.yml \
  up -d --build frontend-tenant landing

# 3. Verificar:
curl -I https://openpadel.pro          # debe redirigir a HTTPS y devolver 200
curl -I https://openpadel.pro/login    # debe llegar al SPA del tenant
```

**urbanvoice.intellify.pro — landing (todavía sin tenant):**

La landing de UrbanVoice (`sites/urbanvoice/`) vive en un subdominio de
`intellify.pro`, así que el wildcard DNS `*.intellify.pro` ya la resuelve: no
hay que tocar DNS (a diferencia de los dominios propios del cliente). Tampoco
hay tenant que crear todavía; el directorio `sites/urbanvoice/` y su router
`landing-urbanvoice` ya están en el `landing` compartido.

```bash
cd /opt/gestion.ar   # en el VPS, con el commit ya pulleado

docker compose --env-file .env.prod \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.tenants.prod.yml \
  up -d --build landing

# Verificar (la primera request HTTPS en el host dispara la emisión del
# certificado TLS-ALPN-01 — puede tardar unos segundos):
curl -sI https://urbanvoice.intellify.pro/ | head -1                  # 200 text/html
curl -sI https://urbanvoice.intellify.pro/images/logo.png | head -1   # 200 image/png
```

`/login`, `/dashboard`, `/assets/*`… devuelven 404 de nginx: son rutas del SPA
del tenant, que todavía no existe. Cuando se implemente hay que agregar su
router `tenant-urbanvoice` **y** restringir el rule de `landing-urbanvoice`
(ver `docs/ops/INFRASTRUCTURE.md` § “Caso urbanvoice”).
