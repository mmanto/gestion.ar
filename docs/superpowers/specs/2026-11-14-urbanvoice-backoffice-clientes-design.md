# UrbanVoice backoffice — Entrega 1: tema + Clientes

Fecha: 2026-11-14
Estado: propuesta para aprobar

## Intento

Que el backoffice del tenant UrbanVoice sea una réplica literal —diseño y
contenido— de la administración de la demo (`/home/mmanto/tmp/urbanvoice/administracion/`),
implementada de a una sección. Esta entrega deja montado el tema visual y la
sección **Clientes** completa (listado + ficha). El resto de los items del menú
llega en entregas siguientes, sobre el mismo shell.

La demo es la referencia de qué se ve y qué se puede hacer; el producto es
`frontend-tenant/`. La demo usa datos de ejemplo en `localStorage`; esta entrega
hace lo mismo para poder validar sin backend. La integración con la API real es
una etapa posterior y no se diseña acá.

## Contexto

- La demo tiene cinco paneles. Acá sólo se replica `administracion/` y, dentro
  de ella, sólo Clientes: `js/clubes.js` (`vClubs`, `vClub` y los modales de
  abono) más lo que el shell necesita (`js/interfaz.js`, `js/app.js`,
  `shared/core.js`, `shared/panel.css`, `shared/icons.js`, `shared/fonts.css`).
- El backoffice de tenant ya elige el chrome por **tema visual**: `TemplateId`
  (`default` | `kero` | `devbout`), `branding.template_id`, catálogo en
  `src/templates/registry.ts`, selector en Ajustes › Marca. `urbanvoice` se suma
  como cuarto tema; no es una app aparte.
- Las páginas son compartidas entre temas. La única pieza de contenido que hoy
  varía por tema es la grilla del Escritorio (`ClientsGrid`).
- El tenant UrbanVoice todavía no existe en infraestructura. El tema se valida
  eligiéndolo en Ajustes › Marca sobre un tenant de desarrollo.

## Objetivos

1. Tema `urbanvoice` seleccionable en Ajustes › Marca, sin afectar a los otros
   tres temas.
2. Shell idéntico a la demo: sidebar (marca, único item Clientes, arte inferior),
   topbar (buscador de clientes, campana, menú de usuario), colapso a mini en
   desktop y off-canvas con scrim en mobile.
3. Sección Clientes: listado con buscador, chips de estado con contadores,
   filtros por plan, partner y tipo; orden por estado y nombre; tabla con
   Cliente/Plan/Estado/Abono/Uso; estado vacío; fila → ficha.
4. Ficha: cabecera, alerta de estado, pestañas Resumen, Abono y pagos, Uso y
   puesta en marcha e Historial, con las tarjetas de la demo.
5. Acciones propias de Clientes/Abono operativas sobre el store de demo:
   registrar y anular pago, cambiar plan, precio especial, suspender/reactivar,
   dar de baja, editar datos, notas, nueva contraseña (mostrada para enviar),
   puesta en marcha, mensaje/recordatorio por WhatsApp, recibos y descargas CSV.
6. Persistencia en `localStorage`, igual que la demo: recargar conserva cambios.
7. Al ingresar con el tema activo, la home es `/clients` (no `/dashboard`).

## No objetivos

- Integrar Clientes con la API del producto (`clientsService`).
- Construir los demás items del menú (Partners, Cobros, Soporte, Avisos,
  Reportes, Planes, Equipo, Registro, Configuración).
- Replicar el login de la demo: se conserva el login del tenant.
- Replicar el sitio del cliente ni el panel del cliente.
- Android/APK, deploy o Traefik.
- Cambiar el comportamiento de los temas existentes.

## Anti-objetivos

- Un segundo sistema de diseño en Tailwind: el tema usa el CSS de la demo
  vendorizado. Reescribir 1.046 líneas a utilidades no es réplica y agrega
  divergencia.
- Controles muertos. Todo control visible funciona sobre el store de demo o no
  se muestra (ver «Corte de la entrega»).
- Estilos del tema filtrándose al resto del backoffice.

## Restricciones

- React + TypeScript + Vite, Tailwind 4, un único `index.css` global.
- `:root.backoffice` aplica una escala tipográfica al backoffice. El CSS de la
  demo es en px y fija su propio `font-size` (14px), así que el tema no se
  reescala con el viewport: es intencional para que sea idéntico a la demo.
- El SPA comparte `TenantProvider`/`AuthProvider`/`TemplateProvider`: el tema
  consume el usuario y el tenant reales, no los de la demo.
- Convención de documentación del repo: actualizar `SCREENS.md`, `DESIGN.md`,
  `DECISIONS.md` y `CHANGELOG.md` al cerrar.

## Enfoques considerados

1. **Tema React en `frontend-tenant`** (elegido). Shell y pantallas propias,
   `panel.css` vendorizado y scopeado, datos demo en un módulo TS. Nace dentro
   del producto: login y sesión reales, y cada sección nueva se suma al mismo
   shell sin reescribir. Costo: portar CSS (~1.046 líneas) y helpers.
2. **Copia estática en `frontend-tenant/public/administracion/`**. Copiar y
   recortar los archivos de la demo. Literal y rápido, pero queda fuera del SPA
   (sin login, sin sesión, sin tema) y hay que portarlo después: trabajo
   duplicado. Sólo sirve como maqueta.
3. **Iframe de la demo dentro del tema**. Literal inmediato, pero dos apps
   anidadas, scroll doble, sin integración de sesión ni navegación. Descartado.

Se eligió 1 para no tirar el trabajo de la validación. Dentro de la entrega, las
piezas de la ficha que dependen de módulos inexistentes se omiten (no se
muestran deshabilitadas ni como placeholder).

## Decisiones

### D1 · Registro del tema

- `src/types/template.types.ts`: `TemplateId` suma `'urbanvoice'`.
- `src/templates/registry.ts`: entrada nueva con `label: 'UrbanVoice'`,
  `AppLayout: UrbanVoiceAppLayout` y `ClientsGrid: DefaultClientsGrid` (el campo
  es obligatorio; el Escritorio no se usa en este tema).
- El selector de Ajustes › Marca se alimenta de `TEMPLATES`, así que no hay que
  tocar esa pantalla.

### D2 · Despacho de la pantalla Clientes

La ruta monta `src/pages/ClientsRoute.tsx` (componente nuevo y chico) en vez de
tocar `pages/Clients.tsx`:

```
const { templateId } = useTemplate();
const { clientId } = useParams();
if (templateId === 'urbanvoice') return <UrbanVoiceClients />;
if (clientId) return <Navigate to="/clients" replace />;
return <Clients />;
```

Así la pantalla clásica queda intacta y no se rompe el orden de hooks.
`UrbanVoiceClients` usa el `clientId` para listado o ficha. En los otros temas,
si llega un `clientId`, se redirige a `/clients` para no dejar una URL con un
parámetro que esa pantalla ignora.

### D3 · Ruta de la ficha

Se agrega `path="/clients/:clientId"` con el mismo componente `Clients` y el
mismo `ProtectedRoute` (`admin`, `operativo`). No se agrega ninguna ruta más.

### D4 · Store de demo

`src/templates/urbanvoice/demo/` contiene el puerto del modelo de ejemplo:

- `types.ts` — `Plan`, `Club`, `Pay`, `LogEntry`, `User`, `AuditEntry`,
  `MessageTemplate`, `Partner`, `DemoDb`.
- `seed.ts` — puerto de `seed()` (planes, clubes, pagos, log, cfg), de
  `clubExtras()` (uso, puesta en marcha, historial), `partnersSeed()`,
  `usersSeed()`, `auditSeed()` y `tplsSeed()`. Sólo lo que consume Clientes.
- `store.ts` — singleton con `load()`/`save()`/mutaciones; clave
  `uv-admin-db`, versión propia. Misma semántica que `op-db` de la demo: si la
  versión no coincide, se resiembra. Sin UI de reset en esta entrega.
- `selectors.ts` — `state()`, `plan()`, `clubPrice()`, `planPrice()`,
  `planRule()`, `specialOn()`, `health()`, `setupPct()`, `inSetup()`, `active()`,
  `badge()`, `hBadge()`, `partnerOf()`, `siteUrl()`, filtros y orden del listado.
- `format.ts` — `money`, `nS`, `fD`, `fDs`, `rel`, `relTs`, `iso`, `pd`, `addD`,
  `addM`, `diff`, normalización de texto.

Nada de `window.*` ni de globals: los módulos exportan funciones tipadas.

### D5 · CSS vendorizado y scopeado

- `src/templates/urbanvoice/panel.css`: transcripción mecánica de
  `shared/panel.css` con todo colgando de `.uv-admin` (`:root` y `body` →
  `.uv-admin`; `.app` → `.uv-admin .app`; `body.noscroll` →
  `.uv-admin.noscroll`; `*` → `.uv-admin, .uv-admin *`). Se conserva el resto
  igual, con una cabecera que indica el archivo y la fecha de origen para poder
  diffear contra la demo.
- Se importa una sola vez desde `AppLayout.tsx` del tema. No se toca
  `index.css`.
- El modal bloquea el scroll del documento con el mismo efecto que
  `body.noscroll` (clase temporal en `document.body` con estilo inline no; se
  agrega la clase global ya existente si existe, o se maneja desde el
  componente). Ver «Lo que queda al builder».

### D6 · Íconos y glifos

- `UvSprite` monta una sola vez los `<symbol id="o-…">` de `shared/icons.js` que
  usa el tema; `UvIcon` renderiza `<svg class="i"><use href="#o-…"/></svg>`.
- `lineIcon(emoji, size)` reemplaza `lineIc()` de `shared/line-icons.js` con
  sólo los glifos de `MODS`/`BASE_MODS` que aparecen en la ficha.

### D7 · Tipografía

- Se copian los seis WOFF de Inter de `shared/fonts/` a
  `src/templates/urbanvoice/fonts/` con sus `@font-face`. `.uv-admin` usa
  `Inter, system-ui, …` como la demo. No se agrega Google Fonts.

### D8 · Assets

- `public/uv/urbanvoice-logo.png` y `public/uv/logo-icono.png` (copiados de
  `shared/img/`). La sidebar usa el logo horizontal tal como la demo.
- El logo del club en listado y ficha es el fallback de la demo: iniciales
  sobre el color del club (los datos de ejemplo no traen imágenes).

### D9 · Home del tema

- `resolveHomePath()` devuelve `/clients` cuando
  `tenant.branding.template_id === 'urbanvoice'`. En `goToHome()` se aplica
  también en la URL interna del apex (hoy fuerza `/dashboard`). El resto de los
  roles/temas no cambia.

### D10 · Shell: identidad y menú

- La sidebar muestra un único link a `/clients` con el contador de clientes
  activos.
- El menú de usuario muestra el usuario autenticado (nombre, rol, iniciales),
  **Configuración** (link a `/settings`, igual que la demo) y **Salir** (logout
  real). No se muestran Equipo ni «Página de venta» hasta que existan.
- La campana muestra «Para hacer» derivado **sólo de datos de Clientes**
  (abono vencido o por vencer, suspendido, riesgo de baja, puesta en marcha
  incompleta). Cada item navega a su ficha. El «Ver todo en el dashboard» de la
  demo no se incluye.
- El buscador de la topbar replica la búsqueda rápida de la demo (nombre,
  localidad, responsable, slug) y navega a `/clients/:id`.
- Burger: en desktop alterna `side-mini`; en mobile abre la sidebar con scrim.
- El botón «Ver la página de venta» de la topbar no se incluye.

### D11 · Corte de la entrega

Se incluye todo lo que Clientes puede resolver con sus propios datos. Se omite
lo que depende de módulos que todavía no existen:

- Botón **Partners** del encabezado del listado.
- Pestaña **Soporte y avisos** de la ficha (tickets y avisos).
- Tarjeta **Pendiente con este cliente** del Resumen (tasks de otros módulos).
- Tarjeta **Comprobantes que mandó** del tab Abono (comprobantes de Cobros).
- Acciones de la ficha **Ver sitio**, **Entrar al panel**, **Enviar acceso** y
  **Cambiar partner** (sitio/panel del cliente, usuarios y partners).
- Enlaces a «Ver todos»/dashboard y cualquier navegación fuera de Clientes.

Consecuencias visuales directas: la cabecera de la ficha queda con dos acciones;
el *glance* de cuatro botones queda con tres (sin «Consultas abiertas»); el tab
Abono no lleva el badge de comprobantes; y la barra de tabs no muestra «Soporte
y avisos».

La URL del sitio en la cabecera se muestra como texto, no como link. Los
controles que quedan (pago, plan, precio especial, suspender, baja, notas,
edición de datos, contraseña, puesta en marcha, mensaje, recibos, CSV) se
implementan completos contra el store.

### D12 · Entregas siguientes

Partners → Cobros y abonos → Soporte y avisos → el resto. Cada una habilita las
piezas omitidas de la ficha (comprobantes, tickets, avisos, «pendiente», Ver
sitio/panel, cambiar partner) sin rehacer el shell.

### D13 · Backend: el tema tiene que ser aceptado

`backend/app/routers/tenant_router.py` valida `template_id` contra
`VALID_TEMPLATE_IDS = {"default", "kero", "devbout"}`. Sin `urbanvoice`, el
PATCH de Ajustes › Marca devuelve 400 y el tema no se puede activar. Se agrega
el id al set y se actualiza el comentario (que cita el `TemplateId` del
frontend). No hay otro punto de validación: `branding.template_id` se guarda
como string y el frontend resuelve ids desconocidos a `default`.

Verificación del backend: con el stack de desarrollo, `PATCH
/api/tenant/branding` con `{"template_id":"urbanvoice"}` responde 200 y
`GET /api/public/tenants/current` lo devuelve. Un id inválido sigue dando 400.

### D14 · Permisos: mapeo de roles del producto al de la demo

La demo distingue `admin`, `ventas`, `cobranzas` y `soporte` (`equipo.js`). El
producto tiene `admin` y `operativo` (la ruta ya permite ambos). Se porta el
mecanismo (`canV`, `canA`, `applyPerms`) a `permissions.ts` con este mapeo:

| Rol del producto | Rol de la demo | Efecto en Clientes |
|---|---|---|
| `admin` | `admin` | Todo: montos, pagos, plan, precio especial, suspender/baja, edición, setup, recordatorios. |
| `operativo` | `ventas` | Sin montos ni acciones de cobro/plan/baja; sí listado, ficha, datos, edición de datos y recordatorios. El tab Abono y los bloques `data-money` no se muestran; los checkboxes de puesta en marcha quedan deshabilitados. |

Se aplica en el shell (ítem del menú), en el listado (columna Abono y uso),
en la ficha (tabs, tarjetas y botones) y en los modales: un control que el rol
no puede usar no se renderiza, igual que `applyPerms` oculta por selector.
`soporte` de la demo no aplica: ese rol no entra a este backoffice.

Es un mapeo conservador: `operativo` no ve dinero. Si el tenant necesita que
operativo cobre, se cambia a `cobranzas` en una línea.

### D15 · Rutas fuera de Clientes y vuelta a Ajustes

El tema es Clientes-only en el menú, pero las páginas siguen existiendo. Bajo
`urbanvoice`, `UrbanVoiceAppLayout` redirige a `/clients` cualquier ruta privada
que no sea `/clients*` ni `/settings` (las páginas privadas renderizan dentro
del `AppLayout`, así que el redirect no parpadea). `/settings` queda accesible
porque es donde se elige el tema, y se llega desde **Configuración** en el menú
de usuario. Las rutas públicas (`/`, `/login`, `/registro`, `/chat/...`) no
pasan por el `AppLayout` y no se tocan.

### D16 · Identidad en «Quién hizo cada cambio»

El seed de auditoría conserva los ids y nombres de la demo (Martín Bruno, Diego
Giovannetti, …). Las acciones nuevas registran `userName` con el nombre del
usuario autenticado (o `username` si no hay nombre), y no se inyectan usuarios
reales en `DB.users`. El render usa `a.userName ?? DB.users.find(u => u.id ===
a.user)?.name ?? '—'`, así el historial viejo sigue leyéndose y el nuevo
muestra a quien operó.

## Estructura de archivos

```
backend/app/routers/tenant_router.py   # + 'urbanvoice' en VALID_TEMPLATE_IDS
frontend-tenant/src/
  pages/ClientsRoute.tsx           # despacha Clásico vs UrbanVoice
  pages/Clients.tsx                # sin cambios
  App.tsx                           # + ruta /clients/:clientId
  types/template.types.ts           # + 'urbanvoice'
  utils/homePath.ts                 # home /clients con el tema
  templates/
    registry.ts                     # + entrada urbanvoice
    urbanvoice/
      AppLayout.tsx                 # shell + guard de rutas
      permissions.ts                # canV/canA + mapeo admin/operativo
      panel.css                     # panel.css vendorizado + scope .uv-admin
      fonts.css, fonts/*.woff       # Inter
      ui/UvIcon.tsx, UvSprite.tsx, LineIcon.tsx
      ui/Modal.tsx, Toast.tsx, Tooltip.tsx
      clients/UrbanVoiceClients.tsx # listado | ficha según useParams
      clients/ClientsList.tsx
      clients/ClientDetail.tsx      # cabecera, tabs, tarjetas
      clients/tabs/SummaryTab.tsx
      clients/tabs/BillingTab.tsx   # abono, pagos, historial del abono
      clients/tabs/UsageTab.tsx     # uso + puesta en marcha
      clients/tabs/HistoryTab.tsx   # actividad + quién hizo cada cambio
      clients/modals/PayModal.tsx
      clients/modals/PlanModal.tsx
      clients/modals/SpecialPriceModal.tsx
      clients/modals/EditClientModal.tsx
      clients/modals/MessageModal.tsx
      clients/modals/PasswordModal.tsx
      clients/modals/ReceiptModal.tsx
      clients/modals/ConfirmModal.tsx   # suspender/reactivar/baja
      demo/types.ts, seed.ts, store.ts, selectors.ts, actions.ts, format.ts
frontend-tenant/public/uv/urbanvoice-logo.png, logo-icono.png
```

## Contenido de la sección

### Listado (`vClubs`)

- Encabezado: «Clientes», «N clientes en la plataforma · M dados de baja».
- Tarjeta de filtros: buscador, chips Todos/Al día/Vence pronto/En prueba/Pago
  atrasado/Suspendido/Dado de baja con contador, selects Plan/Partner/Tipo.
- Tabla: Cliente (logo, nombre, tag de tipo, tipo · barrio, localidad, provincia
  · responsable), Plan (+vecinos), Estado, Abono (+vencimiento/prueba/baja),
  Uso (salud + puesta en marcha), flecha. Orden por estado y luego nombre.
- Estado vacío con el texto de la demo.

### Ficha (`vClub`)

- Volver a Clientes.
- Cabecera: logo, nombre, tipo · barrio, localidad, provincia · vecinos ·
  «cliente desde», badges de estado/plan/salud y URL (texto).
- Acciones: Registrar pago, Mensaje (las dos primeras de la demo que sobreviven
  al corte; ver D11).
- Alerta según estado (prueba, vence pronto, atrasado, suspendido, baja).
- Glance (3 botones: Abono, Uso, Puesta en marcha) y tabs: Resumen, Abono y
  pagos, Uso y puesta en marcha, Historial.
- Resumen: Abono (precio, período, total pagado, regla del plan, módulos,
  acciones de abono), Seguimientos (alta, completar y borrar; son propios de
  Clientes), Datos del cliente, Notas internas.
- Abono y pagos: Abono + Pagos (tabla con recibos, anular pago, CSV) +
  Historial del abono.
- Uso: Uso del cliente (movimientos en 4 semanas, por 100 vecinos, vecinos con
  acceso, último ingreso, barras semanales, CTA de WhatsApp) + Puesta en marcha
  (checkboxes).
- Historial: Actividad (log) y Quién hizo cada cambio (audit).

Los textos, formatos (es-AR), colores y estructuras se copian de `clubes.js`;
no se reescriben.

## Verificación

1. `cd frontend-tenant && npm run build` (tsc + Vite) sin errores.
2. Backend: `PATCH /api/tenant/branding` con `{"template_id":"urbanvoice"}`
   responde 200 y el branding público lo devuelve; un id inexistente sigue
   dando 400.
3. Stack de desarrollo (`make up`), ingresar a un tenant, Ajustes › Marca ›
   UrbanVoice, guardar. Abrir `/clients`.
4. Comparar en el navegador contra la demo servida desde
   `/home/mmanto/tmp/urbanvoice/administracion/index.html` (requiere servir la
   raíz `/home/mmanto/tmp/urbanvoice` para que resuelva `../shared`):
   listado, filtros, ficha y sus cuatro tabs, desktop y mobile.
5. Probar escrituras: registrar pago (cambia estado y vencimiento), anular pago,
   cambiar plan, precio especial, suspender/reactivar, baja, notas, edición de
   datos, puesta en marcha; recargar y confirmar persistencia; volver a la demo
   y verificar los mismos números.
6. Entrar como `operativo` y confirmar el corte de montos/acciones (D14); entrar
   como `admin` y confirmar que están todas.
7. Volver a un tema existente y confirmar que listado y navegación no cambiaron
   y que no hay estilos de `.uv-admin` filtrándose.

## Lo que queda al builder

- Cómo transformar `panel.css` (script de una vez o edición mecánica) y cómo
  manejar el bloqueo de scroll del modal sin tocar `index.css`.
- Qué símbolos de `icons.js` y qué glifos de `line-icons.js` entran exactamente
  (los referencia el código portado).
- Nombres internos de los componentes y si conviene partir algún tab en más
  archivos.
- Cómo se calcula el «Para hacer» de la campana usando sólo datos de Clientes
  (el `todos()` de la demo mezcla otros módulos).
- Detalles de accesibilidad que ya trae `shared/a11y.js` (foco en modales, Esc)
  y cómo se replican con React.
