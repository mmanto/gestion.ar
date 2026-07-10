# CHANGELOG.md

Historial de cambios del proyecto. Seguir el formato [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

---

## [Sin versión] - En desarrollo

### Implementado
- Bot multi-canal: WhatsApp (Meta + Twilio), Telegram, Web (WebSocket), PWA
- Sistema RAG con ChromaDB y sentence-transformers
- Integración con Claude API (Anthropic) y Ollama como proveedores LLM intercambiables
- Gestión de bots, canales y clientes por propietario (JWT)
- Flujo conversacional progresivo para captura de datos (LeadTrackers)
- Push Notifications via VAPID para canal PWA
- Agente IUS para embudo de conversión de servicios legales laborales
- Dashboard frontend con React + Vite + Tailwind
- Docker Compose para entorno de desarrollo y producción

### Implementado
- Sistema de notificaciones toast (`useToast`) enganchado al interceptor de errores de `api.ts`: cualquier error de una petición al backend (validación, conflicto, red, etc.) ahora se le informa siempre al usuario, en vez de quedar solo en la consola del navegador (ej. dar de alta un usuario con un nombre ya existente no mostraba ningún aviso)

### Corregido
- Dropdown de tenant al crear un agente (`frontend/src/pages/Bots.tsx`): pedía `limit=200` al listar tenants, pero el backend (`GET /api/admin/tenants`) rechaza `limit>100` (422 Unprocessable Content), dejando el desplegable vacío
- Aislamiento de datos por agente en RAG (ChromaDB): cada documento ahora pertenece a un único bot_id, tanto en la ingesta como en la búsqueda/listado/borrado (antes la knowledge base era global y compartida entre todos los agentes)
- El entrenamiento configurado por agente (system_prompt/ius_config) ahora se aplica también en WhatsApp y Telegram (antes solo se usaba en el canal Web; los demás canales respondían con un prompt genérico igual para todos los agentes)
- Los endpoints de documentos (`/api/documents/*`, `/api/rag/*`) ahora requieren autenticación y ownership del bot; varios de ellos no requerían login en absoluto

### Eliminado
- `/api/documents/*` y `/api/rag/*` (globales, sin bot_id) → reemplazados por `/api/bots/{bot_id}/documents/*`
- `POST /api/chat` y `POST`/`GET /api/webhook` (WhatsApp legacy) deprecados (410 Gone)
- Campo vestigial `Bot.knowledge_base_id` (nunca se llegó a usar)

---

## Formato

```
## [x.y.z] - YYYY-MM-DD

### Agregado
- Nuevas features

### Cambiado
- Cambios en features existentes

### Corregido
- Bug fixes

### Eliminado
- Features o endpoints removidos

### Breaking Changes
- Cambios que rompen compatibilidad
```
