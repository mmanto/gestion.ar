# gestion.ar — Plataforma de chatbots conversacionales

Bot multi-canal con IA (Claude API) y RAG para atención al cliente, gestión de leads y automatización de conversaciones.

---

## Stack

| Capa | Tecnología |
|---|---|
| Backend | FastAPI 0.100+ / Python 3.11 |
| Base de datos | MongoDB 7 + Redis 7 + ChromaDB |
| LLM | Claude API (Anthropic) / Ollama (configurable) |
| Frontend | React + Vite + TypeScript + Tailwind CSS |
| Canales | WhatsApp (Meta + Twilio), Telegram, Web (WebSocket), PWA |
| Contenedores | Docker + Docker Compose |
| Testing | Pytest |

---

## Estructura del repositorio

```
.
├── backend/              # FastAPI app
│   ├── app/
│   │   ├── routers/      # Endpoints por dominio y webhooks por canal
│   │   ├── models/       # Pydantic models (Bot, Client, Channel)
│   │   ├── services/     # Lógica de negocio
│   │   ├── providers/    # Proveedores de canales (Meta, Twilio)
│   │   ├── main.py       # App FastAPI + endpoints principales
│   │   ├── claude_service.py   # Integración Claude API + Ollama
│   │   ├── rag_service.py      # Sistema RAG (ChromaDB + embeddings)
│   │   └── conversation_service.py
│   ├── documents/        # Archivos subidos para RAG
│   └── Dockerfile
├── frontend/             # React + Vite app (dashboard)
│   ├── src/
│   └── Dockerfile
├── docs/                 # Documentación
│   ├── dev/              # Setup, API, modelo de datos, decisiones
│   ├── ops/              # Infraestructura, deployment, runbook
│   ├── qa/               # Testing, checklist de entrega
│   ├── design/           # Pantallas y sistema de diseño
│   └── *.md / *.json     # Documentos de dominio de negocio
├── infra/                # Configuración de Traefik
├── scripts/              # Scripts de utilidad
├── docker-compose.yml
├── docker-compose.prod.yml
├── AGENTS.md
├── CHANGELOG.md
└── ENV.md
```

---

## Inicio rápido

```bash
# Clonar y configurar entorno
git clone <repo-url>
cd gestion.ar
cp .env.example .env.dev
# Completar variables en .env.dev (ver ENV.md)

# Levantar con Docker
docker compose up -d

# Verificar
curl http://localhost:8000/api/health
```

Ver `docs/dev/SETUP.md` para configuración completa de canales y desarrollo.

---

## Documentación técnica

| Documento | Descripción |
|---|---|
| `docs/dev/SETUP.md` | Setup del entorno y configuración de canales |
| `docs/dev/API.md` | Contratos de endpoints |
| `docs/dev/DATA_MODEL.md` | Modelo de datos (MongoDB + ChromaDB) |
| `docs/dev/DECISIONS.md` | Decisiones técnicas (ADRs) |
| `docs/ops/INFRASTRUCTURE.md` | Infraestructura y requerimientos de servidor |
| `docs/ops/DEPLOYMENT.md` | Guía de deploy |
| `docs/ops/RUNBOOK.md` | Procedimientos de incidentes |
| `docs/qa/TESTING.md` | Estrategia de tests |
| `docs/qa/QA_CHECKLIST.md` | Checklist de entrega |
| `docs/design/SCREENS.md` | Inventario de pantallas |
| `ENV.md` | Variables de entorno |
| `CHANGELOG.md` | Historial de cambios |
| `AGENTS.md` | Instrucciones para agentes de IA |

---

## Documentos de dominio de negocio

| Documento | Descripción |
|---|---|
| `docs/IUS_JSON_IMPLEMENTACION.md` | Agente IUS para embudo de servicios legales laborales |
| `docs/ius_system_prompt.json` | System prompt estructurado del agente IUS |
| `docs/LeadFlow_Law_PWA_v2.docx` | Especificación del producto LeadFlow Law |

---

## Comandos principales

```bash
# Desarrollo
docker compose up -d
docker compose logs -f backend

# Producción
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Tests
docker compose exec backend pytest

# Acceder a MongoDB (host)
mongosh mongodb://localhost:27018/gestionar_dev

# Acceder a Redis (host)
redis-cli -p 6380
```
