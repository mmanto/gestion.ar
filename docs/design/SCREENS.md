# SCREENS.md — Inventario de pantallas del dashboard

---

## Pantallas implementadas

| Pantalla | Ruta | Descripción |
|---|---|---|
| Login | `/login` | Autenticación con usuario y contraseña |
| Dashboard | `/` | Vista principal con métricas de conversaciones |
| Bots | `/bots` | Grilla (`DataTable`) de agentes con buscador, columnas, paginación y acceso a la configuración (`/bots/:id`); alta con diálogo propio (tenant + módulos) |
| Bot - Detalle | `/bots/:id` | Configuración de un bot específico |
| Canales | `/bots/:id/channels` | Gestión de canales de un bot. En un canal de voz, la edición incluye «API key del tenant»: estado, **Generar**/**Rotar** (la key se ve una sola vez, con botón Copiar) para autenticar el APK/PWA de voz. |
| Conversaciones | `/conversations` | Listado y búsqueda de conversaciones |
| Conversación | `/conversations/:id` | Vista de una conversación con opción de responder como agente |
| Clientes | `/clients` | Listado de clientes (leads) con filtros |
| Knowledge Base | `/knowledge-base` | Gestión de documentos RAG |
| Chat Web | `/chat/:botId` | Chat público embebible para canal web |
| Chat Canal | `/chat/c/:channelId` | Chat público de un canal específico |
| Editar tenant | `/admin/tenants/:id/editar` | Datos generales del tenant (nombre, dominio, estado, plan) y su marca (logos, color, tagline). Solo `super_admin` |
| Detalle de tenant | `/admin/tenants/:id` | Usuarios, módulos otorgados y agente del tenant. Si tiene un agente asignado, muestra nombre/estado y enlaza a su configuración (`/bots/:id`). Solo `super_admin` |
| Planes | `/admin/plans` | Grilla (`DataTable`) de planes con buscador, columnas y paginación; alta/edición por `defineEntity` (nombre, descripción, monto, periodicidad) y borrado con confirmación. Solo `super_admin` |

**Frontend de tenant (`frontend-tenant/`, un panel por tenant):**

| Pantalla | Ruta | Descripción |
|---|---|---|
| Registro "Crea tu cuenta" | `/registro` (alias `/register`) | Autoregistro público de un admin del tenant: plan mensual/anual, nombre/correo/contraseña y pago Mercado Pago. Réplica del bloque de la landing ius. |
| Ajustes | `/settings` | Información de la cuenta; **Marca** (solo `admin`): logos, color primario, tagline, rubro (`branding.industry`), visibilidad de la barra lateral y **tema visual del panel** —«Clásico» (`default`), «Kero» (`kero`) o «Panel» (`devbout`, shell de `@mmanto/devbout-ui`)—, guardado por tenant en `branding.template_id`; **Proveedor de IA** (solo `admin`, ver ADR-038): proveedor (Claude/DeepSeek/OpenRouter), modelo, API key propia con estado configurado/sin configurar, botones Guardar / Probar conexión / Quitar configuración; biometría y passkeys. |
| Compartir | `/compartir` | El staff comparte sus datos y su link de chat web propio con un cliente por WhatsApp: input de número + botón que abre `wa.me` con el mensaje armado. |

---

## Pantallas pendientes / por definir

- [ ] Analytics avanzados (timeline de uso, costo por bot)
- [ ] Gestión de usuarios (multi-usuario por organización)
- [ ] Templates de mensajes WhatsApp
- [ ] Configuración de flujo conversacional (LeadTrackers - FlowConfig)
- [ ] Vista de lead scoring por cliente

---

## Convenciones del dashboard

- Layout: sidebar de navegación + área de contenido principal. El chrome depende
  del **tema visual** del tenant (`branding.template_id`, se elige en Ajustes ›
  Marca):
  - «Clásico» (`default`): Navbar oscura fija + sidebar propio colapsable.
  - «Kero» (`kero`): topbar + sidebar flotante.
  - «Panel» (`devbout`): shell de `@mmanto/devbout-ui` — sidebar colapsable a
    iconos (`SidebarProvider`/`Sidebar`/`SidebarRail`), `SidebarInset` con header
    de breadcrumb y `NavUser` en el pie. El contenido de las páginas es el mismo
    en los tres temas.
- **Navegación mobile (< `md`)**: en «Clásico» y «Kero» la sidebar no se muestra
  —el menú del avatar (UserMenu) ES el menú de la aplicación—; en «Panel» el
  sidebar pasa a `Sheet` (drawer) y el menú del avatar se reemplaza por el
  `NavUser` del sidebar.
- Framework: React + Vite + TypeScript
- Estilos: Tailwind CSS
- Estado servidor: React Query (TanStack Query)
- Routing: React Router
