# INFRASTRUCTURE.md — Infraestructura

---

## Diagrama de servicios

```
Internet
   │
   ▼
[Traefik] ── SSL termination ──► :443
   │
   ├──► /          → Frontend React/Vite  (puerto 80 interno)
   └──► /api       → Backend FastAPI      (puerto 8000 interno)
             │
             ├──► MongoDB  :27017 (red interna Docker)
             ├──► Redis    :6379  (red interna Docker)
             └──► ChromaDB :volume chroma_data
```

---

## Servicios Docker

| Servicio | Imagen | RAM runtime | Puerto interno | Puerto host (dev) |
|---|---|---|---|---|
| `backend` | build local (Python 3.11) | ~1.8-2.5 GB | 8000 | 8000 |
| `frontend` | build local (Node 20 / Nginx) | ~50-80 MB | 80 | 5173 (dev) / 80 (prod) |
| `mongo` | mongo:7 | ~512 MB | 27017 | 27018 |
| `redis` | redis:7-alpine | ~150 MB | 6379 | 6380 |
| `traefik` | traefik:v3 (prod) | ~50 MB | 80, 443 | — |

> El backend consume más RAM por `sentence-transformers` (PyTorch): ~1.8-2.5 GB solo para el proceso Python.

---

## Requerimientos del servidor

### Mínimo viable (hasta ~10 usuarios/día)

```
RAM:    4 GB   (mínimo absoluto — con menos, OOM en la primera query RAG)
vCPU:   2 cores
Disco:  40 GB SSD
OS:     Ubuntu 22.04 LTS
```

### Producción real (hasta ~50 usuarios/día)

```
RAM:    8 GB
vCPU:   4 cores
Disco:  80 GB SSD
```

### Opciones VPS recomendadas

| Proveedor | Plan | RAM | vCPU | Disco | Precio/mes |
|---|---|---|---|---|---|
| **Hetzner** (recomendado) | CX31 | 8 GB | 2 vCPU | 80 GB | ~€8.29 |
| **Hetzner** | CPX31 | 8 GB | 4 vCPU | 160 GB | ~€16.90 |
| Contabo | Cloud VPS S | 8 GB | 4 vCPU | 200 GB | ~$8.99 |
| DigitalOcean | Basic 4 GB | 4 GB | 2 vCPU | 80 GB | ~$24 |

> Hetzner CX31 (~€8/mes) es la opción más eficiente para comenzar.

### Latencia RAG según CPU

| Usuarios/día | vCPU mínimo | Latencia RAG |
|---|---|---|
| 1-5 | 2 | 3-8 seg/query |
| 5-30 | 4 | 3-6 seg/query |
| 30+ concurrentes | 8 o GPU | Requiere rediseño |

---

## Red (obligatorio para webhooks)

| Requisito | Necesario para |
|---|---|
| IP pública estática | Webhooks de WhatsApp y Telegram |
| Dominio con DNS apuntando al servidor | SSL + URLs estables de webhook |
| HTTPS (SSL/TLS) | Telegram lo exige; PWA push notifications también |
| Puertos 80 y 443 abiertos | Traefik / Nginx |

> Let's Encrypt + Traefik = SSL automático y gratuito.

---

## Estrategia lean: reducir a 2 GB RAM (~$6-12/mes)

Si se externalizan los servicios pesados:

| Componente | Opción gratuita | RAM liberada |
|---|---|---|
| MongoDB | MongoDB Atlas M0 (512 MB gratis) | ~512 MB |
| Redis | Redis Cloud 30 MB gratis | ~150 MB |
| RAG desactivado (`use_rag: false` en bots) | — | ~1.8 GB |

Con esta configuración el backend consume ~300-400 MB → VPS de 2 GB es suficiente para bots sin RAG.

---

## Almacenamiento en disco

| Dato | Tamaño |
|---|---|
| Imágenes Docker (4 contenedores) | ~5-6 GB |
| OS + herramientas | ~8-10 GB |
| `mongo_data` (conversaciones, clientes, bots) | ~100 MB inicial, crece lento |
| `chroma_data` (vectores embeddings) | ~50 MB inicial, crece con documentos |
| `./backend/documents` (PDFs/DOCX subidos) | Variable |
| **Total mínimo** | **~20-25 GB → pedir 40 GB+** |

---

## SSL / Certificados

En producción se usa **Traefik** con Let's Encrypt integrado (renovación automática).

Ver `docker-compose.prod.yml` para la configuración de Traefik con ACME.

```yaml
# Traefik en docker-compose.prod.yml
traefik:
  command:
    - "--certificatesresolvers.letsencrypt.acme.email=admin@tudominio.com"
    - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
    - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
```

---

## Ruteo de landings en dominio compartido con tenant

Cada landing (ius, laboralia, proptech, ver `docker-compose.tenants.prod.yml`)
comparte el dominio con el SPA de su tenant (`frontend-tenant-*`). El SPA es un
app de una sola página cuyo nginx sirve `index.html` para casi cualquier ruta
(`try_files $uri /index.html`), así que si una página estática de la landing
cae en el router del tenant, "no se ve" (devuelve el index del SPA).

Por eso el router de la landing lleva prioridad explícita y matchea por path:

- **cualquier página `.html`** de la landing vía `PathRegexp(^/.*\.html$)` — así
  se agregan páginas nuevas (ej. `contacto.html`) **sin tocar esta regla**;
- la raíz `/` y los assets propios de la landing (svg/png/jpg/webp, lista fija
  sin colisión con `/icons`, `/img`, `favicon.ico` del SPA).

Cualquier otra ruta (`/login`, `/dashboard`, `/assets/*`, `/api/*`, `/ws/*`)
sigue cayendo en el tenant. No listar cada `.html` a mano: si una página no se
ve, primero verificar que el `.html` exista dentro del contenedor de la landing
(`docker exec <landing> ls /usr/share/nginx/html`); si la ruta es correcta y el
archivo existe, el `PathRegexp` ya la enruta al contenedor correcto.

---

## Backups

```bash
# Backup manual de MongoDB
docker compose exec mongo mongodump --out /dump_$(date +%Y%m%d)
docker cp gestion_mongo:/dump_$(date +%Y%m%d) ./backups/mongo_$(date +%Y%m%d)

# Backup automático (cron diario a las 3am)
# 0 3 * * * /opt/app/scripts/backup.sh
```

---

## Monitoreo

| Qué monitorear | Herramienta |
|---|---|
| Uptime del sitio | UptimeRobot / Better Uptime |
| Logs del backend | `docker compose logs -f backend` |
| Uso de disco | `df -h` |
| Uso de RAM/CPU | `htop` / `docker stats` |
| Certificado SSL | Traefik auto-renewal (ACME) |

---

## Checklist de setup inicial en servidor

- [ ] Ubuntu 22.04 LTS con IP pública estática
- [ ] Docker Engine + Docker Compose v2 instalados
- [ ] Dominio con registro A apuntando a la IP del servidor
- [ ] Firewall: puertos 22 (SSH), 80 y 443 abiertos únicamente
- [ ] Archivo `.env.prod` (raíz del repo) con todas las variables (ver `ENV.md`)
- [ ] `docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build`
- [ ] Registrar webhooks en Meta for Developers y Telegram BotFather
- [ ] Verificar health: `curl https://tudominio.com/api/health`
