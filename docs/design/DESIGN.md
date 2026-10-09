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

---

## Temas (pantalla Apariencia)

- Pantalla: `/apariencia` (`frontend/src/pages/Apariencia.tsx`), con link en `frontend/src/config/navLinks.tsx`. Secciones: **Modo** (Claro / Oscuro / Sistema), Presets, Tipografía, Bloques y Vista previa.
- Catálogo de presets vendoreado en `frontend/src/lib/theme-presets/catalog.ts` (9 presets, generado con `scripts/generate-theme-presets.mjs`) más la opción «Predeterminado» (tema base).
- Preset, tonos de bloque y tamaño de títulos se emiten como CSS `html:root` / `html:root.dark` que `frontend/src/components/theme-preset-provider.tsx` inyecta en `<head>` (style + links de Google Fonts) y persiste en `localStorage['theme-preset']`.
- Claro/oscuro: `frontend/src/context/ThemeContext.tsx` + `frontend/src/lib/colorScheme.ts` (clase `.dark` y `color-scheme` en `<html>`, `localStorage['gestionar-theme']`, atajo de teclado `d`).
- Ambos se aplican antes del primer render: `bootstrapThemePreset()` y `bootstrapColorScheme()` se llaman en `frontend/src/main.tsx`.
- El tema es **global**: los tokens viven en `:root`/`.dark`, así que afectan a los dos templates y a las páginas públicas.
- Límite conocido: las páginas del admin todavía usan utilidades grises (`text-gray-900`, `bg-white`, `border-gray-300`) heredadas; en modo oscuro ese texto queda por debajo del contraste legible. Migrarlas a tokens está pendiente.

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
- Los tokens semánticos (`--primary`, `--card`, `--radius`, …) son el otro contrato:
  los define la app, el paquete sólo usa tokens.

## Templates del admin

`frontend/src/templates/registry.ts` expone dos shells conmutables desde el dropdown del usuario («Diseño», `components/layout/TemplatePicker.tsx`): `default` («Clásico», `templates/default/`) y `kero` (`templates/kero/`). Cada página se envuelve a sí misma con `components/layout/AppLayout.tsx`, que despacha al `AppLayout` del template activo (`localStorage['gestionar-template']`). El `SidebarProvider` vive dentro de cada template para no envolver las rutas públicas.
