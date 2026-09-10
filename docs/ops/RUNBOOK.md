# RUNBOOK.md — Procedimientos de respuesta a incidentes

---

## El backend no responde

```bash
# 1. Ver estado de contenedores
docker compose ps

# 2. Ver logs recientes
docker compose logs --tail=50 backend

# 3. Reiniciar backend
docker compose restart backend

# 4. Verificar health
curl http://localhost:8000/api/health
```

---

## El bot no responde mensajes de WhatsApp

1. Verificar que el contenedor backend esté corriendo: `docker compose ps`
2. Verificar que el webhook esté activo en Meta for Developers
3. Verificar que la URL del webhook sea accesible desde internet: `curl https://tudominio.com/api/health`
4. Revisar logs del backend: `docker compose logs -f backend`
5. Verificar que el canal tenga status `active` en la base de datos

---

## Error OOM (Out of Memory) en el backend

Causa probable: el modelo de embeddings de `sentence-transformers` requiere ~1.8 GB de RAM.

```bash
# Ver uso de memoria
docker stats

# Si el servidor tiene solo 2 GB RAM, desactivar RAG:
# En la config del bot, setear use_rag: false
# O externalizar MongoDB y Redis a servicios cloud (ver INFRASTRUCTURE.md)
```

---

## La knowledge base RAG está vacía o corrupta

```bash
# Ver estadísticas de RAG
curl http://localhost:8000/api/rag/stats

# Si está corrupta, limpiar y re-indexar
curl -X DELETE http://localhost:8000/api/rag/clear

# Re-indexar documentos (subir via API o dashboard)
```

---

## El backend no carga el modelo de embeddings (warning de huggingface.co en logs)

Síntoma: al arrancar (o en cada request de documentos) aparece en logs
`huggingface.co ... Failed to resolve 'huggingface.co'` / `NameResolutionError` y
RAG queda desactivado ("Error inicializando RAG" al levantar la app). Si además
el `docker compose build` muere en el paso del modelo con `exit code: 1`, el
host tampoco alcanza huggingface.co en build — y el deploy abortado deja
corriendo la imagen vieja (que es la que sigue tirando el warning).

Causa: el modelo de embeddings (`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`)
se descargaba de Hugging Face en el primer arranque del contenedor. Si el host
no resuelve `huggingface.co`, la descarga falla y el modelo nunca carga.

### Hosts con acceso a huggingface.co (build normal)

El Dockerfile intenta descargar y bakear el modelo en build; el runtime corre
offline (`HF_HUB_OFFLINE=1`). Con acceso, reconstruir alcanza:

```bash
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build app
# El build debe imprimir: Modelo de embeddings bakeado: sentence-transformers/...
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml exec app python -c "from app.rag_service import get_rag_service; print(get_rag_service().get_stats())"
```

### Hosts SIN acceso a huggingface.co (ni en build)

El paso de bake es tolerante: el build termina con un AVISO y la imagen sale sin
modelo. El modelo se provee como snapshot local montado (una sola vez):

1. En una máquina con internet (el dev), exportar el snapshot del modelo:
   `huggingface_hub.snapshot_download("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2", local_dir="/tmp/embedding-model")`.
2. Copiarlo al servidor: `scp -r /tmp/embedding-model deploy@<server>:/tmp/`
   y colocarlo fuera del repo: `sudo mv /tmp/embedding-model /opt/models/embedding-model`.
3. En `.env.prod` del servidor (no commiteado): `EMBEDDING_MODEL=/models/embedding-model`.
   `docker-compose.prod.yml` ya monta `/opt/models/embedding-model:/models/embedding-model:ro`.
4. Redeploy normal: el runtime carga el modelo del snapshot local, sin red.

Verificar carga: `docker compose ... logs app | grep "Cargando modelo"` debe
mostrar `/models/embedding-model` y "✅ Modelo cargado (384 dimensiones)".

---

## MongoDB no arranca

```bash
# Ver logs de MongoDB
docker compose logs mongo

# Verificar espacio en disco
df -h

# Reiniciar MongoDB
docker compose restart mongo
```

---

## SSL / Certificado vencido

Traefik renueva automáticamente via ACME Let's Encrypt. Si falla:

```bash
# Ver logs de Traefik
docker compose logs traefik

# El archivo acme.json tiene las fechas de los certificados
cat /letsencrypt/acme.json | python3 -m json.tool | grep -A2 "notAfter"
```

## SSL / Host nuevo nunca obtiene certificado ("tls: internal error" en ACME)

Síntoma: un tenant/dominio nuevo (`Host(...)` con `tls.certresolver=letsencrypt`)
queda en bucle sin certificado; el browser muestra "no puede otorgar una
conexión segura" y el log de Traefik muestra algo como:

```
acme: error: 400 :: urn:ietf:params:acme:error:tls ::
Fetching https://<host>/.well-known/acme-challenge/<token>: remote error: tls: internal error
```

Causa: el certresolver usaba **HTTP-01** (`acme.httpchallenge.entrypoint=web`)
y `entrypoints.web` tiene un **redirect global HTTP→HTTPS**. El challenge de
LE llega por `http://`, Traefik responde 308 → `https://`, LE sigue el
redirect y ahí aún no hay certificado para ese SNI → Traefik aborta el
handshake con `internal error` → nunca se emite. Los hosts que ya tenían cert
no se ven afectados (solo renuevan); rompe la **primera emisión** de cualquier
host nuevo.

Fix: el certresolver debe usar **TLS-ALPN-01** (ya aplicado en
`infra/traefik/docker-compose.yml`):

```yaml
- "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"
# (quitar el --...acme.httpchallenge.entrypoint=web)
```

TLS-ALPN negocia el challenge a nivel del handshake TLS en `:443` (ALPN
`acme-tls/1`) sin pasar por el redirect HTTP.

> `The ACME resolver is skipped from the resolvers list error="unable to get
> ACME account: permissions 755 for /acme.json are too open, please use 600"`.
> Traefik exige permisos **600** en el archivo del store. Dos escenarios lo
> generan: (a) el archivo montado quedó en 755; o (b) el punto de montaje del
> volume **apunta a un archivo inexistente** (`...:/acme.json`) y Docker crea
> ahí un **directorio** (`ls -la` → `drwxr-xr-x` en vez de `-rw-------`). En
> ambos casos el resolver `letsencrypt` **no se registra**: todos los routers
> con `certresolver=letsencrypt` reportan "nonexistent certificate resolver" y
> **ningún** host emite ni sirve cert (se caen TODOS, no solo los nuevos).
>
> **Fix (solución definitiva aplicada en el repo, `docker-compose.yml`):**
> montar el volumen en un **directorio** (`traefik_acme_data:/acme`) y definir
> el store como **archivo dentro** (`--certificatesresolvers.letsencrypt.acme.storage=/acme/acme.json`).
> Así el store se crea como archivo regular (600, owner root del container),
> persiste entre recreates, y no depende de permisos del host ni de rutas del
> repo. Aplicar en el server:
>
> ```bash
> cd /opt/gestion.ar && git pull          # trae docker-compose.yml corregido
> docker compose --profile traefik up -d --force-recreate traefik
> # verificar: resolver cargado, sin "skipped"/"nonexistent":
> docker logs gestionar_traefik 2>&1 | grep -iE "skipped|nonexistent" | tail -3   # sin salida = OK
> # los hosts re-emiten su cert al primer tráfico (TLS-ALPN, unos segundos):
> curl -s -o /dev/null -w '%{http_code}\n' https://ius.intellify.pro/
> curl -s -o /dev/null -w '%{http_code}\n' https://pachoteayuda.intellify.pro/
> ```
>
> Nota: si antes montaste el volume como `:/acme.json` (dejando adentro un
> dir o nada), podés limpiar y arrancar con store nuevo:
> `docker compose --profile traefik down && docker volume rm gestionar_traefik_acme_data && docker compose --profile traefik up -d`
> (los certs previos se re-emiten solos vía TLS-ALPN al primer tráfico de cada
> host).

Aplicar en el server:

```bash
cd /opt/traefik
docker compose up -d --force-recreate traefik
# Verificar la emisión del host que fallaba:
docker compose logs traefik | grep -i "<host>" 
curl -s -o /dev/null -w '%{http_code}\n' https://<host>/   # esperar 200
```

---

## El login con Google/Microsoft en la app mobile vuelve al login / "No se pudo confirmar el login"

Síntoma: el usuario autoriza en Google, el tab se cierra y la app muestra un
error y vuelve al login. El flujo mobile depende de que **Nango entregue el
webhook de auth** al backend (`POST /api/tenant/oauth/webhook/nango`); sin él,
`/tenant/oauth/connect/login/status` queda `pending` para siempre.

El error `Item with given key does not exist` de `SecureStoragePlugin` en los
logs de la app es **ruido normal, no la causa**: el interceptor de axios lee el
token del Secure Storage en cada request y, sin sesión todavía, la key no
existe. La causa real es siempre que el poll de `/connect/login/status` nunca
vio `done`.

Diagnóstico:

```bash
# ¿El backend recibe el webhook? (debe aparecer "recibi evento type=auth…")
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=200 backend | grep tenant_oauth_webhook
```

- Si **no aparece nada** → Nango no está mandando el webhook, o llega y el
  backend lo rechaza con 401 (firma). Revisar en el dashboard de Nango
  (Environment Settings del environment del backend) que la **Webhook URL**
  sea `https://api.intellify.pro/api/tenant/oauth/webhook/nango`, que el
  evento **auth** esté activado y que la **Webhook Signing Key** copiada a
  `NANGO_WEBHOOK_SECRET` sea exactamente la de esa pantalla. Con `primary_url`
  vacío Nango no envía ningún webhook (ver `docs/dev/SETUP.md` →
  "Configurar el webhook de Nango"). Un 401 previo al log "recibi evento"
  significa firma incorrecta — el 2026-08-09 se verificó que el secret de
  `.env.prod` valida correctamente un webhook firmado (200).
- Si aparece `no hay login pendiente para endUserId=…` → el webhook llega pero
  el `end_user.id` no coincide con una sesión (nonce expirado o evento fuera
  del flujo de login). Chequear también que `REDIS_URL` del backend sea
  alcanzable: si Redis no conecta, `OAuthLoginStore` se desactiva en silencio
  y el webhook nunca encuentra el pending (`save_pending` no-op).
- Si aparece `login completado para nonce=…` pero la app aún falla → el
  problema es el polling/red del lado de la app, no el servidor. Antes del
  fix del 2026-08-09 esto podía pasar aunque todo estuviera bien: el status
  endpoint hacía fetch-and-delete (single-use) y la **primera request tras
  retomar la WebView se aborta** — si esa request había consumido el
  resultado, el login quedaba `pending` para siempre. Ahora `/connect/login/status`
  lee sin consumir (peek) y el retry del poll vuelve a leer el resultado.
- **No aparece NÚMERO de intento y el usuario confirma el dashboard OK** →
  revisar la entrega del webhook desde el container de Nango. Verificado el
  2026-08-09: el backend procesa webhooks firmados correctamente (200) y el
  pipeline completo session→webhook→login funciona con una conexión REAL
  (se completó el login de una conexión de Google existente). Las 45
  conexiones de intentos fallidos existen en Nango (creadas por el Custom
  Tab, `endUser.id = tsignup_…`) pero ningún login se completó — el webhook
  no estaba llegando. Causa más probable: **hairpin NAT/DNS** (el container
  de Nango no alcanza la IP pública del propio VPS). Desde el VPS:
  ```bash
  # ¿el container de Nango alcanza el webhook del backend?
  docker compose -f /ruta/a/devbout-oauth/deploy/nango/docker-compose.yaml \
    -f docker-compose.prod.yaml exec nango-server \
    wget -qO- -S --spider https://api.intellify.pro/api/tenant/oauth/webhook/nango 2>&1 | head
  # logs de Nango en la entrega:
  docker compose -f … exec nango-server ls /app/nango/packages/server 2>/dev/null   # (o ver logs)
  ```
  **Desde el 2026-08-10 este problema ya no bloquea el login mobile**: el
  status endpoint resuelve el login **activamente** (pull) buscando la
  connection en Nango por `endUser.id` cuando está pendiente — el webhook es
  solo el camino rápido (ver `docs/dev/API.md` → `GET /connect/login/status`).
  El webhook se sigue debiendo arreglar por otros consumidores y para no
  depender del poll.

### Chequeo rápido del servidor (sin tocar el teléfono)

```bash
API=https://api.intellify.pro
# 1. ¿El backend tiene el router nuevo? (400 = sí; 404 = redeploy pendiente)
curl -s -o /dev/null -w '%{http_code}\n' "$API/api/tenant/oauth/connect/login/status?nonce=x"
# 2. ¿El secret de NANGO_WEBHOOK_SECRET coincide con el dashboard? (
#    firmar un webhook de prueba con el secret del .env: 200 = coincide, 401 = no)
# 3. Loop completo: crear session -> webhook firmado -> status debe devolver el resultado
```

---

## Push Notifications no llegan

1. Verificar que `VAPID_PRIVATE_KEY` y `VAPID_PUBLIC_KEY` estén configuradas en `.env.prod`
2. Verificar que el frontend tenga el service worker registrado
3. Revisar logs del backend al enviar: `docker compose logs -f backend | grep -i push`
4. Verificar en el navegador del cliente que los permisos de notificaciones estén habilitados

---

## Cargar o actualizar las normas del HCD de Bolívar en el RAG de pachoteayuda

El chat de `pachoteayuda.ar` (canal `channel_96ad03bc1a1d` → bot
`bot_7b6946dceb98`) responde consultas sobre las normas del Honorable Concejo
Deliberante de Bolívar. El contenido real vive en los PDFs que enlaza la grilla
de `hcdbolivar.gob.ar` (la grilla sola — título + enlace — no alcanza para
responder con precisión), así que se descargan y se indexa el texto completo.

Pipeline de dos pasos: **fetch** (en la máquina de trabajo) → JSONL → **index**
(dentro del contenedor `app`, contra el volumen de ChromaDB).

> **Subir un documento desde el panel** (`/bots/<id>/documents` →
> `POST /api/bots/<bot_id>/documents/upload|text`) **no** requiere nada de esto:
> la escritura la hace el propio proceso de la app y el chat lo ve en la
> consulta siguiente, sin restart (verificado: `add` en proceso → recuperable
> por similitud enseguida). El `restart app` es necesario sólo para este
> pipeline, que indexa desde **otro** proceso: el índice vectorial (HNSW) vive
> en memoria del proceso de la app y no ve los vectores agregados afuera
> (verificado: seguía sin verlos 90 s después). La metadata, en cambio, sí se
> ve desde el otro proceso apenas se escribe, porque sale de SQLite — por eso
> las consultas por número de norma funcionan antes del restart y las
> temáticas no.

### 1. Armar el corpus (máquina de trabajo)

Necesita `curl` y poppler (`pdftotext`/`pdftoppm`); para las normas escaneadas,
`tesseract` + tessdata de español (`TESSDATA_PREFIX=~/.local/share/tessdata`).

```bash
# La cookie se saca abriendo https://www.hcdbolivar.gob.ar/ en un navegador
# real y copiando la cookie `wssplashchk` (el sitio está detrás de un desafío
# JS anti-bot: sin ella la descarga va a ~0,1 archivos/s en vez de ~12/s).
cd ~/workspace/gestion.ar

python3 scripts/fetch_bolivar_normas.py \
  --grid ~/workspace/bolivar/normas_enlaces.csv \
  --out  ~/workspace/bolivar/normas_corpus.jsonl \
  --cookie "wssplashchk=..."

# Segunda pasada: reintenta con OCR las normas escaneadas (quedan ~300 de
# ~3810 sin texto; ésas se indexan igual como ficha con título/fecha/enlace).
python3 scripts/fetch_bolivar_normas.py \
  --grid ~/workspace/bolivar/normas_enlaces.csv \
  --out  ~/workspace/bolivar/normas_corpus.jsonl \
  --cookie "wssplashchk=..." --retry-scans
```

Es resumible: si se corta, volver a correr el mismo comando sigue donde quedó.
Los PDFs se descartan a medida que se extraen (no se guardan ~800 MB en disco);
el corpus final es ~30 MB.

### 2. Indexar (en el VPS, dentro del contenedor `app`)

Primero deployar el código (el script y los cambios de `RAGService` viven en la
imagen; el contenedor actual no los tiene):

```bash
ssh mmanto@<VPS>
cd /opt/gestion.ar && ./deploy.sh
```

Después copiar el corpus y indexar:

```bash
scp ~/workspace/bolivar/normas_corpus.jsonl mmanto@<VPS>:/tmp/

ssh mmanto@<VPS>
cd /opt/gestion.ar
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml \
  cp /tmp/normas_corpus.jsonl app:/tmp/normas_corpus.jsonl
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml \
  exec -T app python scripts/index_bolivar_normas.py \
    --jsonl /tmp/normas_corpus.jsonl --bot-id bot_7b6946dceb98 --rag-results 5

# El proceso de la app cachea la colección: reiniciar para que el chat vea
# los chunks nuevos.
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml \
  restart app
```

Es idempotente: las normas ya indexadas se saltean (re-correrlo sólo agrega las
nuevas). **Ojo**: si cambian los parámetros de chunking (`--chunk-size`,
`--chunk-overlap`), la idempotencia saltea los documentos ya indexados y no los
re-chunkea — en ese caso hay que re-indexar de cero con `--purge` (borra sólo
los documentos `norma_*` de ese bot, no el resto de su base).

`--rag-results 5` sube `config.rag_results_count` del bot (cuántos fragmentos se
recuperan por consulta). Omitirlo para no tocar la config del bot.

Números de referencia del corpus completo (2026-09): 3.810 normas, **57.840
chunks**, ~30 MB de JSONL, ~450 MB en el volumen `chroma_data`, ~16 min de
indexado. El paso 1 tarda ~6 min la primera pasada y ~1 min el `--retry-scans`.

Después de indexar, verificar en el chat de `pachoteayuda.ar` dos consultas:
una con el número completo ("¿qué dice la ordenanza 3142/2026?") y una con el
número pelado ("Ordenanza 2130", la forma en que la pide un vecino). Las dos
deben traer el contenido del PDF y el enlace oficial; el número pelado se
resuelve por metadata expandiendo los años posibles (ver ADR-016), así que si
esa falla el problema está en `RAGService._norm_number_variants`, no en el índice.

---

## Limpieza de disco

```bash
# Ver uso de disco
df -h
docker system df

# Limpiar imágenes y contenedores no usados
docker system prune -f

# Limpiar logs de Docker (si crecen mucho)
truncate -s 0 /var/lib/docker/containers/*/*-json.log
```
