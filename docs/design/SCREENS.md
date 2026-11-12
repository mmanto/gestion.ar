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
| Tenants | `/admin/tenants` | Grilla (`DataTable`) de tenants con alta, buscador y acceso a la edición. `super_admin` ve todos y elige plan/estado del alta; un `partner` (ADR-041) ve sólo su tenant base y sus derivados y el alta pide únicamente nombre y dominio (plan, estado y settings salen del base). El alta incluye **Nombre interno (URL)** —el slug de `https://intellify.pro/<slug>/`, vacío = se genera del nombre— y una columna **URL interna** con el link `/`+slug (o `—` si el tenant todavía no tiene). El detalle del tenant muestra la misma URL como subtítulo, o el dominio si no hay slug |
| Usuarios | `/admin/users` | ABM global de cuentas de la plataforma (`DataTable`): usuario, nombre, email, rol, tenant y estado; alta con rol + tenant (el tenant desaparece para `super_admin`), edición de datos/rol/contraseña, habilitar/deshabilitar y baja con confirmación. El tenant de una cuenta existente es de sólo lectura. Solo `super_admin` |
| Editar tenant | `/admin/tenants/:id/editar` | Pantalla única de administración del tenant: datos generales (nombre, **nombre interno (URL)**, dominio, estado, plan) y marca (logos, color, tagline), grilla de agentes (con alta de múltiples agentes y enlace a `/bots/:id`), grilla de usuarios (edición de datos, rol y contraseña) y zona de peligro. Los módulos se administran en el agente. `super_admin`: todo. `partner` (ADR-041), variante acotada: sin campo Plan, estado de sólo lectura en su tenant base (select sobre los derivados), agentes sin alta ni enlace a `/bots/:id` — la acción de fila es **Gestionar módulos**, un diálogo con checkboxes de los módulos **ya otorgados** (el partner no otorga ni revoca) —, usuarios sólo `admin`/`operativo`/`broker` y sin columna Plan, y zona de peligro sólo en tenants derivados |
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
