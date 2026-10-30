# DESIGN.md — Sistema de diseño

---

## Stack

- **Framework:** React + TypeScript
- **Estilos:** Tailwind CSS 4 (CSS-first, sin `tailwind.config.js`)
- **Configuración:** `frontend/src/index.css` (tokens en `:root`/`.dark` + bloque `@theme inline`)
- **CSS en el build:** plugin `@tailwindcss/vite`, registrado en `frontend/vite.config.ts` (ya no hay `postcss.config.js`)
- **Primitivas UI:** `frontend/src/components/ui/*`, portadas del sistema de diseño de `devbout-ui/base` (shadcn estilo *base-mira* sobre Base UI + Hugeicons, y `cn` = `clsx` + `tailwind-merge` en `frontend/src/lib/utils.ts`)

---

## Convenciones

- Solo clases Tailwind: sin CSS modules, sin `style={{}}` inline
- Componentes en `frontend/src/components/`
- Preferir componentes funcionales con TypeScript tipado
- Un contexto y su hook viven en archivos separados: `context/<X>Context.tsx` (contexto + provider) y `hooks/use<X>.ts` (hook)

---

## Tokens

Fuente única: `frontend/src/index.css`. Para cambiar un color de la app se toca el token, nunca un hex dentro de un componente.

- **Semánticos (oklch)** en `:root`, con su contraparte en `.dark`: `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--success`, `--warning`, `--info`, `--border`, `--input`, `--ring`, `--chart-1..5` y la familia `--sidebar*`.
- **Tipografía:** escala propia `--fs-xs..7xl` y pesos `--fw-normal|medium|semibold|bold`; el bloque `@theme inline` los mapea a las utilidades `--text-*` y `--font-weight-*`. `--font-sans`/`--font-editorial` son Montserrat (los presets de Apariencia pueden pisarlos).
- **Radios:** `--radius` (0.625rem) y derivados `--radius-sm..4xl`.
- **Títulos:** `--title-size`/`--title-leading` consumidos por las utilidades `heading-screen` y `heading-section`; `--font-heading-font` define la familia de los encabezados.
- **Escala raíz:** `html { font-size: clamp(1rem, 100vw/120, 1.75rem) }` — todas las medidas en `rem` escalan con el viewport.
- `* { border-color: var(--border) }` en `@layer base`: un `border` sin color usa el token.

## Marca

- Logotipo **Intellify** (reemplaza «Gestiona/GESTIONA»): utilidad `brand-logo` en `frontend/src/index.css` — Cormorant Garamond itálica, `33px` fijos (no escalan con el viewport), peso `372` y color `#546e87`.
- La familia se carga en `frontend/index.html` desde Google Fonts sólo en itálica 400: al ser una familia estática, 372 resuelve a esa cara.
- Superficies: `components/layout/Navbar.tsx` (landing sin sesión), `templates/default/AppSidebar.tsx` y `templates/kero/Sidebar.tsx`; con el sidebar colapsado se muestra «I».

---

## Temas (sección Apariencia en Ajustes)

- Pantalla: `/settings` (`frontend/src/pages/Settings.tsx` → sección `Apariencia` de `frontend/src/pages/Apariencia.tsx`); ya no hay link propio en `frontend/src/config/navLinks.tsx`. Solo la ve `super_admin`. Secciones: **Modo** (Claro / Oscuro / Sistema), Presets, Tipografía, Bloques y Vista previa.
- Catálogo de presets vendoreado en `frontend/src/lib/theme-presets/catalog.ts` (9 presets, generado con `scripts/generate-theme-presets.mjs`) más la opción «Base» (tema base declarado en `:root`).
- **Default de la app** (`DEFAULT_SELECTION` en `frontend/src/lib/theme-presets/selection.ts`, versionado con `PRESET_VERSION`): preset **Cian** (`b1tNnABoO`), **Barra de menú** en tono Página y títulos en **Más grande** (`xl`). Se aplica cuando el navegador no tiene elección guardada y no se persiste (un cambio futuro del default sigue llegando); «Restablecer» (`reset()`) borra `localStorage['theme-preset']` y vuelve a él. Los payloads previos (sin `version`) con `code: null` migran al default.
- Preset, tonos de bloque y tamaño de títulos se emiten como CSS `html:root` / `html:root.dark` que `frontend/src/components/theme-preset-provider.tsx` inyecta en `<head>` (style + links de Google Fonts) y persiste en `localStorage['theme-preset']`. `useThemePreset()` expone además `isDefault` y `reset`.
- Claro/oscuro: `frontend/src/context/ThemeContext.tsx` + `frontend/src/lib/colorScheme.ts` (clase `.dark` y `color-scheme` en `<html>`, `localStorage['gestionar-theme']`, atajo de teclado `d`).
- Ambos se aplican antes del primer render: `bootstrapThemePreset()` y `bootstrapColorScheme()` se llaman en `frontend/src/main.tsx`.
- El tema es **global**: los tokens viven en `:root`/`.dark`, así que afectan a los dos templates y a las páginas públicas.
- Límite conocido: varias páginas del admin todavía usan utilidades grises (`text-gray-900`, `bg-white`, `border-gray-300`) heredadas; en modo oscuro ese texto queda por debajo del contraste legible. Migrarlas a tokens está pendiente. Ya migradas: `pages/Settings.tsx` (cuenta + vistas de entidad + Apariencia) y `pages/admin/TenantDetail.tsx` («Gestionar usuarios y módulos») — tokens en toda la pantalla y, para los formularios, la misma receta que los formularios de entidad del paquete (`Dialog` + `Input`/`Select` con label `text-xs font-medium` arriba y pie cancelar/enviar a la derecha).

---

## Componentes base

- [x] Button — `frontend/src/components/common/Button.tsx`. `cva` con `variant`: `default|outline|secondary|ghost|destructive|link` (alias `primary`→`default`, `danger`→`destructive`) y `size`: `default|xs|sm|lg|icon|icon-xs|icon-sm|icon-lg` (alias `md`→`default`); además `loading` y `fullWidth`. Los alias son contrato del remoto Module Federation `appointments`.
- [x] Input — `frontend/src/components/common/Input.tsx` (`label`/`error`/`helperText` sobre la primitiva `components/ui/input.tsx`). Textarea y Select en `frontend/src/components/ui/`.
- [x] Card — `frontend/src/components/common/Card.tsx` (`bg-card`, `border-border`, `rounded-xl`; props `padding`, `shadow`, `hover`)
- [x] Badge — `frontend/src/components/ui/badge.tsx` (pills `default|secondary|outline|destructive|success|warning|info`)
- [x] Modal / Dialog — `frontend/src/components/ui/dialog.tsx` y `sheet.tsx`
- [x] Table — `frontend/src/components/common/Table.tsx`
- [x] Toast / Notification — `frontend/src/context/ToastContext.tsx` + `frontend/src/components/common/ToastContainer.tsx`. Se dispara manualmente con `useToast().showToast()` o automáticamente para cualquier error de API vía el interceptor de `frontend/src/services/api.ts`
- [x] Sidebar Navigation — `frontend/src/components/ui/sidebar.tsx`, adaptado en `frontend/src/templates/default/{AppSidebar,NavMain,NavUser,AdminHeader}.tsx`
- [x] Chat bubble (inbound / outbound / agent) — `frontend/src/components/messages/MessageBubble.tsx`

---

## Paquete de UI compartido

`frontend/` consume **`@mmanto/devbout-ui`** (npm, Apache-2.0) — el kit extraído de
`devbout-ui/base` — para las piezas que ya están parametrizadas como DTO. Hoy lo usa el
`DataTable` declarativo de la pantalla de tenants.

Contrato de consumo (el detalle completo está en el README del paquete):

- `frontend/src/index.css` importa la entrada de Tailwind del paquete
  (`@import "@mmanto/devbout-ui/tailwind.css"`, que hace `@source` sobre su `dist`)
  además de `tw-animate-css` y `shadcn/tailwind.css`, que necesitan sus primitivas.
- La navegación a una ruta declarada en un DTO se inyecta con
  `EntityNavigateProvider` (acá, el `navigate` de react-router) y todo `DataTable`
  necesita `EntityViewProvider` por encima; sin él la pantalla queda en blanco.
- Las apps **no** instalan `@tanstack/react-table`: la API de columnas se re-exporta
  desde el paquete (dos copias de `table-core` dan tipos incompatibles).
- La entidad se declara una sola vez con `defineEntity({ schema, ... })`
  (`TableDTO.entity`): el schema —campos + labels, JSON puro— define el alta, la
  edición **y el detalle**. El `DataTable` deriva de ahí el botón de alta (al lado
  del buscador, con la barra separadora), las acciones de fila y el cuerpo del
  detalle, que se lee por campo (`kind`): `select` con `display: "badge"`, label de
  la opción elegida, etc. `detail.sections` (bloques) y `detail.surface` (cuerpo
  propio) son el escape hatch.
- La superficie (`modal` | `drawer` | `page`) sale de `view` en el schema o en cada
  modo, con `TableDTO.view` como default; si no, manda la preferencia global,
  elegible en **Ajustes › Vistas de entidad** (`frontend/src/pages/Settings.tsx`).
  El `EntityViewProvider` vive en la raíz (`frontend/src/App.tsx`) con
  `locale="es-AR"`, así que cualquier grilla la respeta.
- La validación vive en el paquete (`required`, `minLength`, `maxLength`, `pattern`,
  `min`, `max` desde `rules`, más `entity.validate`) y el alta/edición acepta `build`
  (fila en memoria) u `onSubmit` async contra la API: el form espera la promesa,
  deshabilita el envío, muestra el error si falla y cierra si sale bien.
- Además de `header`, `rowActions` y `bulkActions`, el `DataTable` acepta
  `toolbarActions` (`^0.4.0`): acciones propias en la fila del toolbar, al lado del
  buscador tras la barra separadora. La pantalla del tenant lo usa para el alta de
  usuario, que va en un `Dialog` de la app porque el schema no tiene contraseña ni
  `AvatarPicker`; el botón usa la `Button` del paquete para que ambas grillas
  hereden el mismo toolbar.
- El **título/métricas** de cada grilla también va dentro del componente
  (`dto.header`), no en un `PageHeader` externo: así la cabecera hereda el
  `pt-4` y el orden header → toolbar → tabla → paginación del `DataTable`.
  Es el caso de Tenants y de la grilla de usuarios del tenant.
- Los tokens semánticos (`--primary`, `--card`, `--radius`, …) son el otro contrato:
  los define la app, el paquete sólo usa tokens.

La entidad tenant (`frontend/src/pages/admin/Tenants.tsx`) es la implementación de
referencia: un `defineEntity` con los campos (nombre, dominio, estado con badge,
plan) resuelve alta, edición y detalle de una sola declaración, `onSubmit` contra
`POST`/`PATCH /api/admin/tenants` + refetch silencioso, `selectable: false` y una
`rowAction` «Gestionar usuarios y módulos» a `/admin/tenants/:id`.

Los formularios que necesitan controles que el schema del paquete no cubre usan la misma
receta a mano (`frontend/src/components/common/FormField.tsx`: `FORM_CLASSES` + `ROW_2` +
`Field`, espejo de `ROW_CLASSES`/`FieldControl`): los campos van en **filas de dos** —tres
si son cortos (`select`/`color`/fecha)— dentro de un `@container`, no en una columna.

- `frontend/src/pages/admin/TenantDetail.tsx` («Gestionar usuarios y módulos»): la entidad
  del tenant no se edita acá. La pantalla es la **grilla de usuarios** (el `DataTable` del
  paquete, con buscador, columnas y menú de acciones de fila — *sin* `entity`: el alta y la
  edición siguen en `Dialog` propios porque el schema no renderiza el `AvatarPicker` ni un
  campo de contraseña, y el botón de alta va en el toolbar del `DataTable`
  (`toolbarActions`), al lado del buscador), el **selector de módulos del tenant** y la
  **zona de peligro** (oculta hasta que se pide verla), todo en tokens y sin tarjetas
  contenedoras.
- `frontend/src/pages/admin/TenantEdit.tsx` (`/admin/tenants/:id/editar`): edición del
  tenant (nombre, dominio, estado, plan) **y su marca** (logos, color, tagline). Es la
  superficie de edición de la entidad vía `edit.href`, en lugar del formulario del paquete,
  porque el `AvatarPicker` de los logos no es uno de sus `kind`; el alta sí usa el
  formulario del paquete (la marca se carga después de crear el tenant). Tradeoff: esa
  edición es siempre pantalla completa — no sigue la preferencia de Ajustes › Vistas de
  entidad (para eso el paquete necesitaría un `edit.surface`, como `detail.surface`).

## Templates del admin

`frontend/src/templates/registry.ts` expone dos shells conmutables desde Ajustes › «Diseño» (`frontend/src/pages/Settings.tsx`): `default` («Clásico», `templates/default/`, el default) y `kero` (`templates/kero/`). Cada página se envuelve a sí misma con `components/layout/AppLayout.tsx`, que despacha al `AppLayout` del template activo (`localStorage['gestionar-template']`). El `SidebarProvider` vive dentro de cada template para no envolver las rutas públicas.
