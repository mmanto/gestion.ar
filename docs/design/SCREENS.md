# SCREENS.md — Inventario de pantallas del dashboard

---

## Pantallas implementadas

| Pantalla | Ruta | Descripción |
|---|---|---|
| Login | `/login` | Autenticación con usuario y contraseña |
| Dashboard | `/` | Vista principal con métricas de conversaciones |
| Bots | `/bots` | Listado y gestión de bots |
| Bot - Detalle | `/bots/:id` | Configuración de un bot específico |
| Canales | `/bots/:id/channels` | Gestión de canales de un bot |
| Conversaciones | `/conversations` | Listado y búsqueda de conversaciones |
| Conversación | `/conversations/:id` | Vista de una conversación con opción de responder como agente |
| Clientes | `/clients` | Listado de clientes (leads) con filtros |
| Knowledge Base | `/knowledge-base` | Gestión de documentos RAG |
| Chat Web | `/chat/:botId` | Chat público embebible para canal web |
| Chat Canal | `/chat/c/:channelId` | Chat público de un canal específico |

**Frontend de tenant (`frontend-tenant/`, un panel por tenant):**

| Pantalla | Ruta | Descripción |
|---|---|---|
| Registro "Crea tu cuenta" | `/registro` (alias `/register`) | Autoregistro público de un admin del tenant: plan mensual/anual, nombre/correo/contraseña y pago Mercado Pago. Réplica del bloque de la landing ius. |

---

## Pantallas pendientes / por definir

- [ ] Analytics avanzados (timeline de uso, costo por bot)
- [ ] Gestión de usuarios (multi-usuario por organización)
- [ ] Templates de mensajes WhatsApp
- [ ] Configuración de flujo conversacional (LeadTrackers - FlowConfig)
- [ ] Vista de lead scoring por cliente

---

## Convenciones del dashboard

- Layout: sidebar de navegación + área de contenido principal
- Framework: React + Vite + TypeScript
- Estilos: Tailwind CSS
- Estado servidor: React Query (TanStack Query)
- Routing: React Router
