<!-- DOCS: Fuente de verdad: devbout-docs (https://github.com/… /home/mmanto/workspace/devbout-docs/). Si este archivo contradice a devbout-docs, prevalece devbout-docs. Antes de cerrar tarea, verifica si un doc de devbout-docs/docs/ debe actualizarse. -->
# AGENTS.md

Instrucciones para agentes de IA que trabajen en este repositorio.
Leer este archivo antes de realizar cualquier tarea.

---

## Regla principal

> **Nunca cerrar una tarea sin verificar si algún documento de `/docs` debe actualizarse.**

---

## Mapa de cambios → documentos

| Tipo de cambio | Archivos a actualizar |
|---|---|
| Nuevo endpoint o modificación de contrato | `docs/dev/API.md` |
| Cambio en modelo de datos (Pydantic/MongoDB) | `docs/dev/DATA_MODEL.md` |
| Nuevo canal de mensajería o cambio de proveedor | `docs/dev/API.md` + `docs/ops/INFRASTRUCTURE.md` |
| Cambio en infrastructure, Docker, Traefik, Nginx | `docs/ops/INFRASTRUCTURE.md` |
| Cambio en proceso de deploy o CI/CD | `docs/ops/DEPLOYMENT.md` |
| Cambio en configuración de canales (webhook URL, proveedor) | `docs/dev/SETUP.md` |
| Decisión técnica relevante (LLM, RAG, DB, proveedor) | `docs/dev/DECISIONS.md` |
| Feature completada, bug corregido, breaking change | `CHANGELOG.md` |
| Nueva variable de entorno requerida | `ENV.md` |
| Cambio en dependencias del backend | `docs/dev/SETUP.md` (sección backend) |
| Cambio en dependencias del frontend | `docs/dev/SETUP.md` (sección frontend) |
| Nueva pantalla o flujo de usuario en el dashboard | `docs/design/SCREENS.md` |
| Cambio en el sistema de diseño o componentes UI | `docs/design/DESIGN.md` |
| Cambio en reglas de calificación, plazos o árbol de decisión de iUS | `docs/ius_legal_config.json` + `docs/IUS_ARBOL_DECISION.md` (regenerar con `scripts/build_ius_arbol_decision.py`) + `docs/qa/ius_casos_semaforo.txt` |

---

## Stack del proyecto

- **Backend:** FastAPI + Python 3.11+ (async)
- **Base de datos:** MongoDB 7 + Redis 7 + ChromaDB (vector store)
- **Frontend:** React + Vite + TypeScript + Tailwind CSS
- **LLM:** Claude (Anthropic), DeepSeek u OpenRouter **por tenant** con API key propia (`tenant_llm_configs`, ADR-038); `LLM_PROVIDER` + keys de `.env` quedan sólo para paths sin tenant (legacy) y Ollama
- **Canales:** WhatsApp (Meta Cloud API + Twilio), Telegram, Web (WebSocket), PWA
- **Infraestructura:** Docker Compose (dev) / VPS + Traefik (prod)
- **Testing:** Pytest (backend)

---

## Convenciones de código

### Backend (FastAPI)
- Un router por dominio en `app/routers/`
- Modelos Pydantic en `app/models/`
- Lógica de negocio en `app/services/`, nunca en routers
- Webhooks de canales: `app/routers/whatsapp_webhook_router.py`, `telegram_webhook_router.py`, etc.
- Un provider por canal externo en `app/providers/`
- Servicios de LLM en `app/claude_service.py` (Claude), `app/deepseek_service.py`, `app/openrouter_service.py` y `app/ollama_service.py`
- El LLM de un tenant se resuelve con `get_llm_for_tenant(tenant_id)` (`app/services/tenant_llm_service.py`): proveedor + modelo + API key cifrada en `tenant_llm_configs`. Sin config, el tenant no responde (no hay fallback a las keys de plataforma)
- `get_llm_service()` (`app/claude_service.py`) es el LLM **global/legacy**, sólo para bots sin tenant

### Frontend (React + Vite)
- Componentes en `frontend/src/components/`
- Estilos únicamente con clases Tailwind (no CSS modules, no style inline)
- Variables de entorno: `VITE_API_URL` (prefijo VITE_ para exponerlas al cliente)

### Base de datos
- **MongoDB:** colecciones `bots`, `clients`, `channels`, `conversations`, `users`, `push_subscriptions`
- **Redis:** rate limiting e idempotencia de webhooks
- **ChromaDB:** knowledge base para RAG (collection `knowledge_base`)
- No usar SQL directo: todo vía Motor (async MongoDB driver)

---

## Formato de commits

```
tipo(scope): descripción breve en español

feat: nueva funcionalidad
fix: corrección de bug
docs: actualización de documentación
refactor: reestructuración sin cambio funcional
chore: tareas de mantenimiento
test: agregar o modificar tests
```

---

## Antes de finalizar cualquier tarea

1. ¿Se agregó, modificó o eliminó algún endpoint? → Actualizar `docs/dev/API.md`
2. ¿Se creó o alteró algún modelo Pydantic? → Actualizar `docs/dev/DATA_MODEL.md`
3. ¿Se tomó una decisión técnica no obvia (LLM, proveedor, DB)? → ADR en `docs/dev/DECISIONS.md`
4. ¿El cambio es visible para el usuario final? → Actualizar `CHANGELOG.md`
5. ¿Se necesita una nueva variable de entorno? → Actualizar `ENV.md`
6. ¿Se cambia cómo configurar un canal (WhatsApp, Telegram)? → Actualizar `docs/dev/SETUP.md`

---

## Documentos de dominio de negocio (solo para referencia)

Los archivos en `docs/` (nivel raíz, no en subdirectorios) son documentos de dominio:
- `docs/IUS_JSON_IMPLEMENTACION.md` — Agente IUS (embudo legal laboral)
- `docs/ius_system_prompt.json` — System prompt estructurado del agente IUS
- `docs/ius_legal_config.json` — Fuente de verdad del prompt del agente IUS (flow, 32 reglas de semáforo, plazos legales y árbol de decisión)
- `docs/IUS_ARBOL_DECISION.md` — Árbol de decisión generado desde ese JSON (no editar a mano)
- `docs/IUS_SEMAFORO_INFORME_*.md` — Mediciones de la suite de semáforo
- `docs/LeadFlow_Law_PWA_v2.docx` — Especificación del producto LeadFlow

Estos documentos definen el QUÉ del negocio. No deben mezclarse con la documentación técnica.
