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

### Agregado
- **Arquitectura mobile con Capacitor (ADR-007):** dos apps nativas desde una sola base de código React (`frontend-tenant/`)
  - **Staff App:** bottom tab navigation (Dashboard, Chats, Clientes, Ajustes), chat de agente en tiempo real vía WebSocket, push notifications nativas (FCM/APNs)
  - **Client App:** chat nativo para clientes finales con push notifications, distribuible en App Store / Play Store
- **Push multi-plataforma:** `push_service.py` ahora routea notificaciones por `platform` (vapid/fcm/apns). Backend soporta registro de device tokens nativos vía `POST /api/push/subscribe`
- **WebSocket staff:** endpoint `/ws/staff/chat/{bot_id}` para que admins/operadores reciban mensajes de clientes en tiempo real y respondan como agentes
- Nuevas dependencias: `@capacitor/core`, `firebase-admin`, `apns2`
- Migración Alembic: `push_subscriptions` extiende con `platform`, `device_token`, `user_id` (FK a users)
- Documentación: ADR-007 en `docs/dev/DECISIONS.md`, contratos WebSocket en `docs/dev/API.md`, modelo actualizado en `docs/dev/DATA_MODEL.md`. Pendientes en `docs/dev/MOBILE.md`.

### Implementado
- Sistema de notificaciones toast (`useToast`) enganchado al interceptor de errores de `api.ts`: cualquier error de una petición al backend (validación, conflicto, red, etc.) ahora se le informa siempre al usuario, en vez de quedar solo en la consola del navegador (ej. dar de alta un usuario con un nombre ya existente no mostraba ningún aviso)

### Corregido
- Dropdown de tenant al crear un agente (`frontend/src/pages/Bots.tsx`): pedía `limit=200` al listar tenants, pero el backend (`GET /api/admin/tenants`) rechaza `limit>100` (422 Unprocessable Content), dejando el desplegable vacío
- Aislamiento de datos por agente en RAG (ChromaDB): cada documento ahora pertenece a un único bot_id, tanto en la ingesta como en la búsqueda/listado/borrado (antes la knowledge base era global y compartida entre todos los agentes)
- El entrenamiento configurado por agente (system_prompt/ius_config) ahora se aplica también en WhatsApp y Telegram (antes solo se usaba en el canal Web; los demás canales respondían con un prompt genérico igual para todos los agentes)
- Los endpoints de documentos (`/api/documents/*`, `/api/rag/*`) ahora requieren autenticación y ownership del bot; varios de ellos no requerían login en absoluto
- Service Worker de `frontend-tenant` (`public/sw.js`) cacheaba `tenant-config.js` con estrategia cache-first pese a que nginx lo sirve con `Cache-Control: no-store` — si un navegador lo pedía antes de que `TENANT_ID_<SLUG>` quedara bien seteado, quedaba pegado a esa respuesta vacía para siempre ("este contenedor no tiene un tenant configurado") aunque el servidor ya sirviera la config correcta. Ahora se excluye de la caché del SW y se bumpeó `CACHE_NAME` para invalidar las entradas ya guardadas

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
