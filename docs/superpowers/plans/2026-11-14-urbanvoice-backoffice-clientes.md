# Backoffice UrbanVoice — tema + Clientes — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sumar el tema visual `urbanvoice` al backoffice de tenant y replicar, con datos de demo persistidos en el navegador, la sección Clientes de la administración de UrbanVoice (listado y ficha con sus acciones).

**Architecture:** Un tema nuevo (`src/templates/urbanvoice/`) aporta shell, CSS vendorizado y pantallas propias. La ruta `/clients` despacha al tema o a la pantalla clásica; `/clients/:clientId` muestra la ficha. Los datos de la demo viven en un store tipado con `useSyncExternalStore` y `localStorage`; ninguna llamada a la API. El backend sólo suma el id del tema a su whitelist.

**Tech Stack:** React 19, React Router 7, TypeScript 5.9, Vite 7, Tailwind 4 (sin tocar), `postcss`/`postcss-selector-parser` (sólo para la transformación de una vez del CSS), `localStorage`.

**Spec:** `docs/superpowers/specs/2026-11-14-urbanvoice-backoffice-clientes-design.md`

## Global Constraints

- No se toca `frontend-tenant/src/pages/Clients.tsx`: el despacho vive en `pages/ClientsRoute.tsx`.
- El CSS de la demo se vendoriza scopeado a `.uv-admin`; no se agrega ni modifica `index.css` global.
- Nada de datos por API: el store de demo es la fuente de verdad de esta entrega.
- Clave de persistencia: `uv-admin-db`, versión `1`. Versión distinta o JSON inválido → resiembra.
- Mapeo de roles: `admin` → `admin` de la demo; `operativo` → `ventas` de la demo.
- Todo control visible funciona con datos de demo o no se renderiza. Nada de `disabled` cosmético ni placeholders.
- La demo de referencia manda en textos, formatos es-AR, colores y estructura.
- Sin dependencias nuevas en `package.json`.
- Commits en español con el formato del repo (`feat:`, `fix:`, `docs:`, `test:`).

## Review Focus

- JSON corrupto o versión vieja en `localStorage` → el backoffice arranca con la semilla, nunca con pantalla en blanco.
- `clientId` inexistente en la URL → vuelve al listado.
- Bordes de fecha (hoy, día de gracia, fin de prueba, mismo día) → mismo estado que la demo.
- Montos, tramos, tope, descuentos y precio especial → exactamente los números de la demo.
- Rol `operativo` → no se filtran montos, pagos, plan, suspensión ni baja, ni por DOM.
- Estilos de `.uv-admin` → no afectan a otros temas ni a rutas públicas.
- Mobile: off-canvas con scrim, ficha usable, scroll bloqueado mientras hay modal.

---

### Task 1: Modelo, semilla y selectores de la demo

**Files:**
- Create: `frontend-tenant/src/templates/urbanvoice/demo/types.ts`
- Create: `frontend-tenant/src/templates/urbanvoice/demo/format.ts`
- Create: `frontend-tenant/src/templates/urbanvoice/demo/seed.ts`
- Create: `frontend-tenant/src/templates/urbanvoice/demo/store.ts`
- Create: `frontend-tenant/src/templates/urbanvoice/demo/selectors.ts`
- Verify (throwaway): `/tmp/uv-demo-check.ts`

**Interfaces:**
- Consumes: nada del repo.
- Produces:
  - `types.ts`: `PlanId`, `Plan`, `ClubStateKey`, `Club`, `ClubUsage`, `ClubSetup`, `SpecialPrice`, `SetupKey`, `HistEntry`, `Pay`, `LogEntry`, `LogType`, `DemoUser`, `AuditEntry`, `MessageTemplate`, `Partner`, `Task`, `DemoConfig`, `DemoDb`, `ListFilters`, `Pending`, `PendingTone`.
  - `format.ts`: `TODAY: Date`, `iso(d: Date): string`, `pd(s: string | null): Date | null`, `addD(d: Date, n: number): Date`, `addM(d: Date, n: number): Date`, `diff(a: Date, b: Date): number`, `money(n: number): string`, `nS(n: number): string`, `fD(s: string | Date | null): string`, `fDs(s: string | Date | null): string`, `rel(s: string | Date): string`, `relTs(ts: number): string`, `norm(s: unknown): string`, `initials(name: string): string`, `waLink(phone: string, text: string): string`.
  - `seed.ts`: `seedDb(): DemoDb`.
  - `store.ts`: `STORAGE_KEY = 'uv-admin-db'`, `STORAGE_VERSION = 1`, `type StorageLike = Pick<Storage, 'getItem' | 'setItem'>`, `loadDb(storage: StorageLike | undefined): DemoDb`, `getDb(): DemoDb`, `useDemoDb(): DemoDb`, `mutate(fn: (db: DemoDb) => void): void`.
  - `selectors.ts`: `plan(db, id)`, `club(db, id)`, `state(db, c)`, `planPrice(p, socios)`, `clubPrice(db, c, planId?)`, `priceFor(db, c, months)`, `discFor(db, months)`, `planRule(p)`, `specialOn(c)`, `active(db, c)`, `paying(db, c)`, `siteUrl(db, c)`, `setupPct(c)`, `inSetup(db, c)`, `health(db, c)`, `partnerOf(db, c)`, `clubPays(db, id)`, `counts(db)`, `filterClubs(db, filters)`, `searchClubs(db, q, limit?)`, `pendingAll(db)`, `badgeMeta(k)`, `healthMeta(k)`, `tasksOf(db, clubId)`, `userName(db, userId, snapshot?)`; constantes `MODS`, `BASE_MODS`, `TIPOS`, `ST`, `HL`, `SETUP`, `SETUP_REQ`, `COLORS`.

- [ ] **Step 1: Escribir el script de verificación que falla**

```ts
// /tmp/uv-demo-check.ts
import { seedDb } from '/home/mmanto/workspace/gestion.ar/frontend-tenant/src/templates/urbanvoice/demo/seed';
import { loadDb } from '/home/mmanto/workspace/gestion.ar/frontend-tenant/src/templates/urbanvoice/demo/store';
import {
  counts, club, clubPrice, filterClubs, pendingAll, searchClubs, setupPct, siteUrl, state, tasksOf,
} from '/home/mmanto/workspace/gestion.ar/frontend-tenant/src/templates/urbanvoice/demo/selectors';

let failed = 0;
const eq = (a: unknown, b: unknown, msg: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { failed++; console.error('FAIL', msg, '→', a, '!=', b); }
  else console.log('ok', msg);
};

const db = seedDb();
eq(db.clubs.length, 13, '13 clubes');
eq(db.plans.length, 3, '3 planes');
eq(db.partners.length, 4, '4 partners');
eq(db.users.length, 5, '5 usuarios');
eq(db.tpls.length, 5, '5 plantillas');
eq(tasksOf(db, 'c2').length, 1, 'seguimiento de c2');
eq(counts(db), { all: 13, activo: 6, pronto: 2, prueba: 2, atrasado: 1, suspendido: 1, baja: 1 }, 'contadores por estado');
eq(state(db, club(db, 'c3')!).k, 'atrasado', 'c3 atrasado');
eq(state(db, club(db, 'c5')!).k, 'suspendido', 'c5 suspendido');
eq(state(db, club(db, 'c6')!).k, 'prueba', 'c6 en prueba');
eq(state(db, club(db, 'c10')!).k, 'baja', 'c10 dado de baja');
eq(clubPrice(db, club(db, 'c1')!), 145000, 'c1 full 1046 vecinos');
eq(clubPrice(db, club(db, 'c2')!), 87000, 'c2 pro 640 vecinos');
eq(clubPrice(db, club(db, 'c3')!), 40000, 'c3 básico 210 vecinos');
eq(priceFor(db, club(db, 'c1')!, 3), 413300, '3 meses con 5% de descuento');
eq(siteUrl(db, club(db, 'c3')!), 'forovecinalolavarria.urbanvoice.com', 'URL del sitio');
eq(setupPct(club(db, 'c3')!), 100, 'puesta en marcha de c3');
eq(filterClubs(db, { q: 'olavarria', st: '', plan: '', part: '', tipo: '' }).map(c => c.id), ['c3'], 'búsqueda sin acentos');
eq(searchClubs(db, 'lucia', 6)[0].id, 'c2', 'búsqueda rápida');
eq(pendingAll(db).length > 0, true, 'hay pendientes para la campana');

const bad = loadDb({ getItem: () => '{oops', setItem() {} });
eq(bad.clubs.length, 13, 'JSON inválido → semilla');
const old = loadDb({ getItem: () => JSON.stringify({ ...seedDb(), v: 0 }), setItem() {} });
eq([old.v, old.clubs.length], [1, 13], 'versión vieja → semilla');

if (failed) process.exit(1);
console.log('TODO OK');
```

- [ ] **Step 2: Correr el script y verificar que falla**

Run: `bun /tmp/uv-demo-check.ts`
Expected: FAIL — no existe `demo/seed.ts`.

- [ ] **Step 3: Implementar `types.ts` y `format.ts`**

`DemoDb` contiene `v: 1`, `plans`, `clubs`, `pays`, `log`, `partners`, `users`, `audit`, `tpls`, `tasks`, `cfg`, `nextN`. `Club` incluye los campos del seed (`plan`, `socios`, `manual`, `paidUntil`, `trialEnd`, `special`, `usage`, `setup`, `hist`, `partner`, `notes`, `bajaAt`, `bajaWhy`). `Pay` incluye `n: number`. `Partner` incluye todos los campos del seed de `partners.js`.

`format.ts` es puerto literal de `shared/core.js` (`money`, `nS` con «vecinos», `fD`, `fDs`, `rel`, `relTs`, `iso`, `pd`, `addD`, `addM`, `diff`, `norm`, `initials`, `waLink`). `TODAY` se calcula una vez al importar.

- [ ] **Step 4: Implementar `seed.ts`**

Puerto de `administracion/js/datos.js` (`seed`, `clubExtras`) más `partnersSeed`/`ensurePartners` de `partners.js`, `usersSeed`/`auditSeed` de `equipo.js`, `tplsSeed`/`tasksSeed` de `mensajes.js`. Sin `localStorage`, sin `link()`, sin leads/apps/news/tickets/proofs. `seedDb()` devuelve `v: 1`, los clubes con `partner` asignado, y `nextN = pays.length + 1`.

- [ ] **Step 5: Implementar `selectors.ts`**

Puerto de `state`, `planPrice`, `clubPrice`, `priceFor`, `discFor`, `planRule`, `specialOn`, `active`, `paying`, `siteUrl`, `setupPct`, `inSetup`, `health` (usando `c.usage.last` como último ingreso, sin `op-ping-*`), `partnerOf`, `clubPays`, `counts`, `filterClubs`, `searchClubs`, `pendingAll`, `badgeMeta`, `healthMeta`, `tasksOf`, `userName`. `filterClubs` ordena por `{ atrasado: 0, suspendido: 1, pronto: 2, prueba: 3, activo: 4, baja: 5 }` y luego por nombre. `pendingAll` devuelve sólo avisos derivados de Clientes (abono vencido/suspendido/próximo, prueba por vencer, puesta en marcha incompleta, riesgo de baja) con `{ clubId, text, tone }`.

- [ ] **Step 6: Implementar `store.ts`**

`loadDb(storage)` lee `STORAGE_KEY`; si el JSON falla, falta `v === STORAGE_VERSION` o la forma mínima no está, devuelve `seedDb()`. `getDb()` carga una vez con `globalThis.localStorage` (guard para entornos sin `window`). `mutate(fn)` clona con `structuredClone`, aplica, persiste con `setItem` y notifica a los suscriptores. `useDemoDb()` es `useSyncExternalStore(subscribe, getDb)`.

- [ ] **Step 7: Correr el script y verificar que pasa**

Run: `bun /tmp/uv-demo-check.ts`
Expected: todas las líneas `ok` y `TODO OK`.

- [ ] **Step 8: Commit**

```bash
git add frontend-tenant/src/templates/urbanvoice/demo
git commit -m "feat(urbanvoice): datos de demo y selectores de clientes"
```

### Task 2: Tema registrado, shell y listado de Clientes

**Files:**
- Modify: `backend/app/routers/tenant_router.py:56-62`
- Modify: `frontend-tenant/src/types/template.types.ts`
- Modify: `frontend-tenant/src/templates/registry.ts`
- Modify: `frontend-tenant/src/App.tsx` (rutas `/clients` y `/clients/:clientId`)
- Modify: `frontend-tenant/src/utils/homePath.ts`
- Create: `frontend-tenant/src/pages/ClientsRoute.tsx`
- Create: `frontend-tenant/src/templates/urbanvoice/AppLayout.tsx`
- Create: `frontend-tenant/src/templates/urbanvoice/permissions.ts`
- Create: `frontend-tenant/src/templates/urbanvoice/panel.css` (generado)
- Create: `frontend-tenant/src/templates/urbanvoice/fonts.css` y `fonts/*.woff`
- Create: `frontend-tenant/src/templates/urbanvoice/ui/{UvIcon,UvSprite,LineIcon,Modal,Toast}.tsx`
- Create: `frontend-tenant/src/templates/urbanvoice/clients/{UrbanVoiceClients,ClientsList,ClientDetail}.tsx`
- Create: `frontend-tenant/public/uv/urbanvoice-logo.png`, `frontend-tenant/public/uv/logo-icono.png`
- Verify (throwaway): `/tmp/scope-uv-css.mjs`

**Interfaces:**
- Consumes: Task 1 (`DemoDb`, `useDemoDb`, `mutate`, `counts`, `filterClubs`, `searchClubs`, `pendingAll`, `badgeMeta`, `healthMeta`, `TODAY`/format, `Club`).
- Produces:
  - `permissions.ts`: `interface UvPermissions { isAdmin: boolean; money: boolean; pay: boolean; plan: boolean; edit: boolean; remind: boolean; setup: boolean }`, `permissionsFor(role: UserRole | undefined): UvPermissions`, `useUvPermissions(): UvPermissions`.
  - `ui/UvIcon.tsx`: `UvIcon({ name, className }: { name: string; className?: string })`.
  - `ui/UvSprite.tsx`: `UvSprite()`.
  - `ui/LineIcon.tsx`: `LineIcon({ emoji, size }: { emoji: string; size?: number })`.
  - `ui/Modal.tsx`: `Modal({ open, title, onClose, children, wide }: { open: boolean; title?: string; onClose(): void; children: ReactNode; wide?: boolean })`.
  - `ui/Toast.tsx`: `ToastProvider({ children })`, `useToast(): { showToast(node: ReactNode): void }`.
  - `AppLayout.tsx`: `UrbanVoiceAppLayout({ children }: { children: ReactNode })`.
  - `clients/UrbanVoiceClients.tsx`: default export, usa `useParams().clientId`; con id renderiza `ClientDetail`, sin id `ClientsList`. Envuelve el contenido en `<AppLayout>`.
  - `clients/ClientDetail.tsx`: `ClientDetail({ clientId }: { clientId: string })` — en esta tarea, volver al listado + cabecera con logo, nombre, badges y URL; sin tabs ni acciones (Task 3 las completa).
  - `ClientsRoute.tsx`: `ClientsRoute()` — despacha `urbanvoice` o Clásico.

- [ ] **Step 1: Agregar el id al backend**

En `backend/app/routers/tenant_router.py`, `VALID_TEMPLATE_IDS = {"default", "kero", "devbout", "urbanvoice"}` y actualizar el comentario que cita `TemplateId`.

- [ ] **Step 2: Levantar el stack y verificar el valor**

Run: `make up`
Run: `docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.tenants.local.yml exec app python -c "from app.routers.tenant_router import VALID_TEMPLATE_IDS as V; assert 'urbanvoice' in V; print(sorted(V))"`
Expected: `['default', 'devbout', 'kero', 'urbanvoice']`.

- [ ] **Step 3: Vendorizar CSS, fuentes y assets**

Copiar `shared/fonts/*.woff` a `frontend-tenant/src/templates/urbanvoice/fonts/` y crear `fonts.css` con los seis `@font-face` de Inter (pesos 400/500/600/700/800/900).
Copiar `shared/img/urbanvoice-logo.png` y `shared/img/logo-icono.png` a `frontend-tenant/public/uv/`.

Crear `/tmp/scope-uv-css.mjs` con `postcss` y `postcss-selector-parser` (ambos ya están en `node_modules`):

```js
import fs from 'node:fs';
import postcss from 'postcss';

const SRC = '/home/mmanto/tmp/urbanvoice/shared/panel.css';
const OUT = '/home/mmanto/workspace/gestion.ar/frontend-tenant/src/templates/urbanvoice/panel.css';
const SPECIAL = [
  [/^body\.side-mini\b/, '.uv-admin.side-mini'],
  [/^body\.nav-open\b/, '.uv-admin.nav-open'],
  [/^body\.noscroll\b/, '.uv-admin.noscroll'],
  [/^body\b/, '.uv-admin'],
  [/^:root\b/, '.uv-admin'],
  [/^html\b/, '.uv-admin'],
  [/^\.side-mini\b/, '.uv-admin.side-mini'],
  [/^\.nav-open\b/, '.uv-admin.nav-open'],
  [/^\.noscroll\b/, '.uv-admin.noscroll'],
];
const scope = (sel) => {
  if (sel === '*') return '.uv-admin, .uv-admin *';
  for (const [re, to] of SPECIAL) if (re.test(sel)) return sel.replace(re, to);
  return `.uv-admin ${sel}`;
};
const root = postcss.parse(fs.readFileSync(SRC, 'utf8'));
root.walkRules((rule) => {
  if (rule.parent?.type === 'atrule' && /keyframes|font-face/.test(rule.parent.name)) return;
  rule.selectors = rule.selectors.map(scope);
});
fs.writeFileSync(OUT, `/* Vendorizado de shared/panel.css (demo UrbanVoice, 2026-11-14). Todo scopeado a .uv-admin. */\n${root.toString()}`);
```

Run: `node /tmp/scope-uv-css.mjs`
Run: `grep -nE '^(body|:root|html)' frontend-tenant/src/templates/urbanvoice/panel.css`
Expected: sin resultados (ningún selector global).

- [ ] **Step 4: Registrar el tema y las rutas**

- `TemplateId = 'default' | 'kero' | 'devbout' | 'urbanvoice'`.
- `registry.ts`: `{ id: 'urbanvoice', label: 'UrbanVoice', AppLayout: UrbanVoiceAppLayout, ClientsGrid: DefaultClientsGrid }`.
- `ClientsRoute.tsx`:

```tsx
import { Navigate, useParams } from 'react-router-dom';
import { useTemplate } from '../hooks/useTemplate';
import { Clients } from './Clients';
import UrbanVoiceClients from '../templates/urbanvoice/clients/UrbanVoiceClients';

export function ClientsRoute() {
  const { templateId } = useTemplate();
  const { clientId } = useParams();
  if (templateId === 'urbanvoice') return <UrbanVoiceClients />;
  if (clientId) return <Navigate to="/clients" replace />;
  return <Clients />;
}
```

- `App.tsx`: importar `ClientsRoute` y usar `<ClientsRoute />` en `/clients`; agregar `<Route path="/clients/:clientId" element={<ProtectedRoute roles={['admin','operativo']}><ClientsRoute /></ProtectedRoute>} />`.
- `homePath.ts`: `const uvHome = tenant?.branding.template_id === 'urbanvoice' ? '/clients' : '/dashboard';` en `resolveHomePath` (después de validar `user`) y en la rama de URL interna de `goToHome`. Navegar client-side también cuando `path === '/clients'`.

- [ ] **Step 5: Implementar permisos, íconos y primitivas**

- `permissionsFor`: `admin` → todo `true`; `operativo` → `{ isAdmin: false, money: false, pay: false, plan: false, edit: true, remind: true, setup: false }`. `useUvPermissions` lee `useAuth().user?.role`.
- `UvSprite` con los símbolos de `shared/icons.js` usados por el tema: `o-club`, `o-search`, `o-bell`, `o-chev`, `o-menu`, `o-x`, `o-out`, `o-gear`, `o-right`, `o-left`, `o-check`, `o-clock`, `o-alert`, `o-cash`, `o-layers`, `o-pause`, `o-play`, `o-trash`, `o-wa`, `o-edit`, `o-key`, `o-down`, `o-ext`, `o-pulse`, `o-plus`, `o-list`.
- `LineIcon` con los glifos de `shared/line-icons.js` para `📣`, `📅`, `📊`, `📑`.
- `Modal`: markup de la demo (`.modal`/`.mbox`/`.mx`), overlay click, `Esc`, foco al primer input, `document.body.style.overflow = 'hidden'` al abrir y restaurar al cerrar.
- `Toast`: `.toast.on`, 2,8 s, `showToast` acepta `ReactNode`.

- [ ] **Step 6: Implementar el shell y el listado**

`UrbanVoiceAppLayout`:
- Importa `panel.css` y `fonts.css`, renderiza `<div className="uv-admin"><UvSprite/><ToastProvider>…</ToastProvider></div>`.
- Guard: si `useLocation().pathname` no es `/clients`, `/clients/…` ni `/settings`, devuelve `<Navigate to="/clients" replace />`.
- Sidebar: logo `/uv/urbanvoice-logo.png`, «Administración de la plataforma», único link `Clientes` con `o-club` y contador `counts(db).all - counts(db).baja`; arte inferior con el SVG y «Más clientes. Más comunidad.».
- Topbar: burger (desktop `side-mini`, mobile `nav-open`), buscador con `searchClubs` y dropdown (logo/iniciales, nombre, localidad · responsable, badge) que navega a `/clients/:id`, campana con `pendingAll` (máx. 7) y contador, menú de usuario con nombre/rol/iniciales reales, `Configuración` (solo `isAdmin`) y `Salir`.
- Mobile: `.scrim` cierra; `nav-open` en el contenedor raíz.

`ClientsList`:
- `useDemoDb()` + `useUvPermissions()`.
- Encabezado, tarjeta de filtros (buscador `norm`, chips con contadores, selects Plan/Partner/Tipo), tabla y estado vacío; textos y clases de `vClubs`.
- Columnas y formatos de la demo; columna Abono y los importes ocultos si `!money`; «Uso» muestra `badgeMeta`/`healthMeta` y `Puesta en marcha N%`.
- Sin botón Partners (D11).
- Click o `Enter` en una fila navega a `/clients/${c.id}`; el buscador de la topbar hace lo mismo.

`ClientDetail` (versión de esta tarea): volver a `/clients`, cabecera con iniciales, nombre, línea de contexto, badges, URL como texto. Sin alerta, glance, tabs ni acciones.

- [ ] **Step 7: Verificar en el navegador**

Run: `cd frontend-tenant && npm run build` → sin errores.
Abrir el backoffice del tenant de desarrollo, Ajustes › Marca › **UrbanVoice**, guardar. Abrir `/clients`. (Cualquier tenant sirve: el tema no depende de un tenant UrbanVoice. Si el stack no tiene usuario, creá uno desde el panel de administración general.)
Expected:
- Sidebar con un solo item Clientes (12) y el arte inferior; topbar con buscador, campana y usuario.
- «12 clientes en la plataforma · 1 dados de baja» (13 en total incluyendo la baja).
- Chips: Todos 13, Al día 6, Vence pronto 2, En prueba 2, Pago atrasado 1, Suspendido 1, Dado de baja 1.
- Buscar `olavarria` deja 1 fila; chip Pago atrasado deja la misma; Plan Pro deja 6; Partner Estudio Digital Sur deja 4; Tipo Candidatura deja 4.
- Abrir la fila de Foro Vecinal Olavarría muestra la cabecera en `/clients/c3`; el buscador de la topbar («lucia») abre `/clients/c2`; `/clients/noexiste` vuelve al listado.
- `/dashboard` redirige a `/clients`; `/settings` abre; Configuración aparece sólo como admin.
- Cambiar el tema a Kero y abrir `/clients`: la pantalla clásica sigue igual y sin estilos del tema.

- [ ] **Step 8: Commit**

```bash
git add frontend-tenant/src frontend-tenant/public/uv backend/app/routers/tenant_router.py
git commit -m "feat(urbanvoice): tema, shell y listado de clientes"
```

### Task 3: Ficha del cliente (sólo lectura)

**Files:**
- Create: `frontend-tenant/src/templates/urbanvoice/clients/ClientDetail.tsx`
- Create: `frontend-tenant/src/templates/urbanvoice/clients/tabs/SummaryTab.tsx`
- Create: `frontend-tenant/src/templates/urbanvoice/clients/tabs/BillingTab.tsx`
- Create: `frontend-tenant/src/templates/urbanvoice/clients/tabs/UsageTab.tsx`
- Create: `frontend-tenant/src/templates/urbanvoice/clients/tabs/HistoryTab.tsx`
- Create: `frontend-tenant/src/templates/urbanvoice/ui/Tooltip.tsx`
- Modify: `frontend-tenant/src/templates/urbanvoice/clients/UrbanVoiceClients.tsx`
- Modify: `frontend-tenant/src/templates/urbanvoice/clients/ClientsList.tsx` (fila → `/clients/:id`)

**Interfaces:**
- Consumes: Task 1 selectors/format/store; Task 2 shell, permisos e íconos.
- Produces:
  - `type DetailTab = 'resumen' | 'abono' | 'uso' | 'historial'`.
  - `ClientDetail({ clientId }: { clientId: string })`.
  - `SummaryTab({ tab, onTab }: { tab: DetailTab; onTab(t: DetailTab): void })` — recibe el `clubId` vía `useParams()`? No: `SummaryTab({ clubId, onTab }: { clubId: string; onTab(t: DetailTab): void })`.
  - `BillingTab({ clubId }: { clubId: string })`.
  - `UsageTab({ clubId }: { clubId: string })`.
  - `HistoryTab({ clubId }: { clubId: string })`.
  - `TooltipHost()` — muestra `.tip` para elementos `[data-tip]` dentro de `.uv-admin`.
  - `WeekBars({ values }: { values: number[] })` exportado por `UsageTab.tsx`.

- [ ] **Step 1: Completar `ClientDetail`**

Agregar a la cabecera existente: alerta, glance y tabs (la cabecera ya está en Task 2).

- Lee el club con `club(getDb(), clientId)`; si no existe, `<Navigate to="/clients" replace />`.
- `<a className="back" href>` de la demo; usar `Link` a `/clients`.
- Cabecera: iniciales en `.clogo` con `c.color`, título, `tipo · barrio, ciudad, provincia · N vecinos · cliente desde mes año`, badges (`badgeMeta(state.k)`, `Plan {name}`, `healthMeta`), URL del sitio como texto con `o-ext`.
- Sin botones de acción en esta tarea (llegan en Task 4/5).
- Alerta por estado con el texto de `vClub` (prueba/pronto/atrasado/suspendido/baja).
- Glance de 3 botones (`Abono`, `Uso`, `Puesta en marcha`) que cambian de tab.
- Barra de tabs: Resumen, Abono y pagos (`!money && !pay` → oculta), Uso y puesta en marcha, Historial.
- `TooltipHost` montado una vez.

- [ ] **Step 2: Implementar `SummaryTab`**

Tres tarjetas, sin acciones:
- **Abono**: precio (`clubPrice`), «Vencido/Vence el/Prueba hasta» (`state.due`), «Pagó en total» + cantidad de pagos (`clubPays`), regla del plan (`planRule`), precio especial si `specialOn`, módulos (`BASE_MODS` + `LineIcon` por cada `MODS[k]`). Sin botones.
- **Datos del cliente**: responsable, WhatsApp, email, partner, usuario, dirección web (texto), tipo, origen «Directo», barrio si tiene, vecinos, alta. Sin Editar/Nueva contraseña/Enviar acceso/Cambiar partner.
- **Notas internas**: texto de `c.notes` en un bloque de sólo lectura (el textarea editable llega en Task 5). Si está vacío, el placeholder de la demo.

- [ ] **Step 3: Implementar `BillingTab`**

- Abono (misma tarjeta del Resumen, sin acciones) + Pagos: tabla Fecha/Período/Medio/Monto con `n` de recibo; sin botones de recibo, anular o descargar (Task 4). Estado vacío de la demo.
- Historial del abono (`c.hist` ordenado por fecha desc), con precio por mes.

- [ ] **Step 4: Implementar `UsageTab` y `HistoryTab`**

- `UsageTab`: tarjeta «Uso del cliente» con `health`, movimientos de 4 semanas, por cada 100 vecinos, `usage.players`, último ingreso (`rel`), `WeekBars` (SVG de `weekBars` con `data-tip`) y el pie; sin CTA de WhatsApp (Task 5). Tarjeta «Puesta en marcha» con `SETUP` en modo lectura (sin checkboxes) y porcentaje.
- `HistoryTab`: «Actividad» desde `db.log` filtrado por club (30) y «Quién hizo cada cambio» desde `db.audit` (30) con `userName`.
- `WeekBars`: mismo SVG de la demo (rects, tooltip «Semana actual/hace N», última barra `cur`).

- [ ] **Step 5: Conectar la navegación**

`UrbanVoiceClients`: con `clientId` renderiza `<ClientDetail clientId={clientId} />`. `ClientsList`: click en `<tr>` navega a `/clients/${c.id}`; `Enter` sobre la fila también (tabIndex 0).

- [ ] **Step 6: Verificar en el navegador**

Run: `cd frontend-tenant && npm run build` → sin errores.
Abrir `/clients`, buscar `Foro Vecinal Olavarría`, abrir la fila (`/clients/c3`).
Expected:
- Cabecera: «Foro Vecinal Olavarría», «Organización vecinal · Olavarría, Buenos Aires · 210 vecinos · cliente desde enero 2026», badges «Pago atrasado», «Plan Básico», «Lo usa bien», URL `forovecinalolavarria.urbanvoice.com`.
- Alerta: «El abono venció el 11/11/2026. Si no paga, el 19/11/2026 se suspende el sitio y el panel del cliente.» (la fecha depende de hoy; con la gracia de 7 días).
- Resumen: Abono mensual `$40.000`, venció `11/11/2026`, «Pagó en total `$360.000`, 9 pagos», regla «$35.000 hasta 150 vecinos · +$5.000 cada 100 vecinos más · máximo $70.000».
- Uso: `60` movimientos en 4 semanas, `7` por cada 100, `57` vecinos con acceso, `5 días` último ingreso; puesta en marcha `100%` con 6 ítems tildados y «Dominio propio» sin tildar.
- Abono y pagos: 9 filas; recibo `000000001`…`000000009`; Historial del abono con «Alta con plan Básico · 210 vecinos».
- Historial: «Recordatorio de pago enviado» y «Sin cambios registrados».
- `/clients/noexiste` → vuelve a `/clients`.
- 390×844: la tabla se apila como tarjetas, la ficha scrollea y las tabs se desplazan sin romper el layout.

- [ ] **Step 7: Commit**

```bash
git add frontend-tenant/src/templates/urbanvoice
git commit -m "feat(urbanvoice): ficha de cliente con sus pestañas"
```

### Task 4: Acciones de abono, pagos y estado

**Files:**
- Create: `frontend-tenant/src/templates/urbanvoice/demo/actions.ts`
- Create: `frontend-tenant/src/templates/urbanvoice/demo/receipt.ts`
- Create: `frontend-tenant/src/templates/urbanvoice/clients/modals/PayModal.tsx`
- Create: `frontend-tenant/src/templates/urbanvoice/clients/modals/PlanModal.tsx`
- Create: `frontend-tenant/src/templates/urbanvoice/clients/modals/SpecialPriceModal.tsx`
- Create: `frontend-tenant/src/templates/urbanvoice/clients/modals/ConfirmModal.tsx`
- Modify: `frontend-tenant/src/templates/urbanvoice/clients/ClientDetail.tsx`
- Modify: `frontend-tenant/src/templates/urbanvoice/clients/tabs/SummaryTab.tsx`
- Modify: `frontend-tenant/src/templates/urbanvoice/clients/tabs/BillingTab.tsx`

**Interfaces:**
- Consumes: Task 1 (`DemoDb`, `Club`, `Pay`, `PlanId`, selectors, format), Task 2 (`useToast`, `Modal`, permisos), Task 3 (tabs).
- Produces:
  - `actions.ts`: `interface Actor { id: string; name: string }`, `actorOf(user: User | null): Actor`, `interface PaymentInput { months: number; amount: number; date: string; method: string; note: string }`, `registerPayment(db, clubId, input, actor): Pay`, `voidPayment(db, payId, actor): void`, `changePlan(db, clubId, planId, actor): void`, `setSpecialPrice(db, clubId, special, actor): void`, `suspendClub(db, clubId, reason, actor): void`, `unsuspendClub(db, clubId, actor): void`, `cancelClub(db, clubId, reason, actor): void`, `reactivateClub(db, clubId, actor): void`, `logAdd(db, clubId, type, text, actor): void`.
  - `receipt.ts`: `openReceipt(db, payId): void`, `receiptWa(db, payId): string | null`, `downloadPaysCsv(db, clubId): void`.
  - `PayModal({ open, clubId, onClose }: { open: boolean; clubId: string; onClose(): void })`.
  - `PlanModal({ open, clubId, onClose })`, `SpecialPriceModal({ open, clubId, onClose })`.
  - `ConfirmModal({ open, title, description, confirmLabel, danger, children, onConfirm, onClose }: { open: boolean; title: string; description?: ReactNode; confirmLabel: string; danger?: boolean; children?: ReactNode; onConfirm(): void; onClose(): void })`.

- [ ] **Step 1: Implementar `actions.ts`**

Puerto de las mutaciones de `clubes.js`. Todas reciben `db` (el borrador de `mutate`) y `actor`, y llaman `logAdd`:
- `registerPayment`: `from = state.trial ? (state.left >= 0 ? pd(c.trialEnd)! : TODAY) : pd(c.paidUntil)!`; `to = addM(from, input.months)`; `n = db.nextN++`; push `{ id: 'p' + Date.now(), n, club: c.id, date, amount, months, from: iso(from), to: iso(to), method, note, plan: plan(c).name, socios: c.socios, disc: discFor(db, months) }`; `c.paidUntil = iso(to)`; si `c.manual === 'suspendido'` → `null`; log `pay`.
- `voidPayment`: borra el pago y recalcula `c.paidUntil` con el `to` máximo de los pagos restantes (o `null`); log `edit`.
- `changePlan`: setea `c.plan`, agrega a `c.hist` `{ at: iso(TODAY), t: 'plan', txt: 'Cambio de plan: X → Y', price: clubPrice(...) }`; log `plan`.
- `setSpecialPrice`: setea/limpia `c.special`; hist `'especial'`; log `plan`.
- `suspendClub`, `unsuspendClub`, `cancelClub`, `reactivateClub`: puerto de `bajaModal`, `reactivate` y del modal de suspensión.
- `logAdd`: `db.log.unshift({ at: iso(TODAY), ts: Date.now(), t, club, txt })`, `db.log = db.log.slice(0, 80)` y `db.audit.unshift({ ts: Date.now(), user: actor.id, userName: actor.name, action: ACT[t] ?? 'Cambio', detail: txt, club })`, `db.audit = db.audit.slice(0, 400)`. `ACT` mapea `pay→'Pago'`, `baja→'Baja'`, `remind→'Recordatorio'`, `sus→'Suspensión'`, `react→'Reactivación'`, `plan→'Plan'`, `edit→'Edición'`, `new→'Alta'`.
- `actorOf`: `{ id: user?.username ?? 'u1', name: [user?.nombre, user?.apellido].filter(Boolean).join(' ') || user?.username || 'Administrador' }`.

- [ ] **Step 2: Implementar `receipt.ts`**

Puerto de `receipt()` y `receiptWa()` de `cobros.js`, reemplazando el logo por `/uv/logo-icono.png`. `openReceipt` abre una ventana (`window.open`) con el mismo HTML/CSS del recibo; si el navegador la bloquea, no falla. `downloadPaysCsv` reproduce `dl()` con las columnas de `pagos-<slug>.csv`.

- [ ] **Step 3: Implementar los modales**

- `PayModal`: segmento 1/3/6/12 meses con descuentos (`discFor`), monto (`priceFor`), fecha (máx. hoy), medio, nota; resumen con período y aviso si el monto no coincide; al enviar `mutate(db => registerPayment(db, ...))`, toast con «Ver recibo» y cierre.
- `PlanModal`: radios de los 3 planes con precio por club y nota de módulos que se prenden/apagan; deshabilitar el envío si no cambió.
- `SpecialPriceModal`: segmento sin especial / descuento % / precio fijo; valor, hasta, motivo; valida > 0 y < 100 en %; resumen del precio resultante; guarda y cierra.
- `ConfirmModal`: genérico; suspender pide motivo (opcional), baja pide select de motivo, reactivar es directo.

- [ ] **Step 4: Conectar acciones en la ficha**

- Cabecera: `Registrar pago` si `perms.pay`; `Mensaje` se agrega en Task 5.
- Resumen/Abono: `Cambiar de plan` si `plan`, `Precio especial` si `money`, `Suspender` si `plan` y no está suspendido a mano, `Quitar suspensión` si suspendido a mano, `Dar de baja` si `plan`. Ocultar toda la tarjeta de montos si `!money` (precio, pagó en total, regla del plan, precio especial).
- Billing: filas con recibo (abre ventana), WhatsApp del recibo, anular pago si `pay`; `Descargar` CSV de los pagos.
- Tras `reactivateClub`, si el club sigue debiendo, abrir `PayModal` (como la demo).

- [ ] **Step 5: Verificar en el navegador**

Run: `cd frontend-tenant && npm run build` → sin errores.
Con `admin`, en `/clients/c3`:
- Registrar pago de 1 mes, monto `40000`, fecha hoy, Transferencia → estado «Al día», vencimiento `11/12/2026`, pagos `10`, total `$400.000`, toast con «Ver recibo»; el recibo abre con N° `0001-000000010`.
- Anular ese pago → vuelve «Pago atrasado», 9 pagos, total `$360.000`.
- Cambiar a Pro → abono `$63.000` (210 vecinos), historial «Cambio de plan: Básico → Pro»; volver a Básico.
- Precio especial 10% → `$36.000` y aviso «Especial»; quitarlo.
- Suspender con motivo → «Suspendido», alerta de suspensión; reactivar → «Pago atrasado» y se abre el modal de pago; cerrar.
- Dar de baja con motivo → «Dado de baja», botón «Reactivar cliente»; reactivar.
- Recargar la página: los cambios persisten. Restaurar el estado original al terminar (`localStorage.removeItem('uv-admin-db')` y recargar).
- Con `operativo`: no hay tab Abono y pagos, no se ven montos ni acciones de pago/plan/baja.

- [ ] **Step 6: Commit**

```bash
git add frontend-tenant/src/templates/urbanvoice
git commit -m "feat(urbanvoice): pagos, plan, precio especial y estados del cliente"
```

### Task 5: Datos, notas, seguimientos, puesta en marcha y mensajes

**Files:**
- Create: `frontend-tenant/src/templates/urbanvoice/demo/messages.ts`
- Modify: `frontend-tenant/src/templates/urbanvoice/demo/actions.ts`
- Create: `frontend-tenant/src/templates/urbanvoice/clients/modals/EditClientModal.tsx`
- Create: `frontend-tenant/src/templates/urbanvoice/clients/modals/MessageModal.tsx`
- Create: `frontend-tenant/src/templates/urbanvoice/clients/modals/PasswordModal.tsx`
- Modify: `frontend-tenant/src/templates/urbanvoice/clients/ClientDetail.tsx`
- Modify: `frontend-tenant/src/templates/urbanvoice/clients/tabs/SummaryTab.tsx`
- Modify: `frontend-tenant/src/templates/urbanvoice/clients/tabs/UsageTab.tsx`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `actions.ts` suma: `updateClubData(db, clubId, patch: Partial<Pick<Club, 'name'|'city'|'prov'|'owner'|'phone'|'email'|'tipo'|'socios'|'slug'>>, actor): void`, `setNotes(db, clubId, notes, actor): void`, `setSetup(db, clubId, key: SetupKey, done: boolean, actor): void`, `addTask(db, clubId, due, text, actor): void`, `completeTask(db, taskId, actor): void`, `deleteTask(db, taskId): void`, `logMessage(db, clubId, templateName, actor): void`.
  - `messages.ts`: `tplList(db): Array<{ id: string; name: string; text: string; fixed?: boolean }>`, `fillTemplate(db, text, club): string`, `tplSuggest(db, club): string`.
  - `EditClientModal({ open, clubId, onClose })`, `MessageModal({ open, clubId, onClose })`, `PasswordModal({ open, clubId, onClose })`.

- [ ] **Step 1: Implementar las mutaciones restantes**

- `updateClubData`: aplica el patch; si cambió `socios`, agrega a `hist` `{ t: 'socios', txt: 'Vecinos: A → B' }`; si cambió el slug, valida que no lo use otro club; log `edit` con «Datos del cliente actualizados».
- `setNotes`: guarda `c.notes` (sin log, como la demo).
- `setSetup`: setea `c.setup[key]`; si completa al 100%, log `edit` «Puesta en marcha completa».
- `addTask` / `completeTask` / `deleteTask`: puerto de `tasksSeed`/`bindTasks`; al completar, log `edit` «Seguimiento hecho: …».
- `logMessage`: log `remind` «Mensaje enviado: {templateName}».

- [ ] **Step 2: Implementar `messages.ts`**

Puerto de `tplList`, `fillTpl`, `tplSuggest` de `mensajes.js`, con las variables `{dueño}`, `{cliente}`, `{plan}`, `{monto}`, `{vence}`, `{alias}`, `{sitio}`, `{usuario}`, `{vecinos}`.

- [ ] **Step 3: Implementar los modales**

- `EditClientModal`: mismos campos y validaciones de `editClub` (nombre, localidad, provincia con datalist, responsable, WhatsApp, tipo, vecinos, email, slug con `.dominio` y unicidad). Al guardar, toast con el cambio de abono si cambió la cantidad de vecinos.
- `MessageModal`: picker de plantillas, textarea editable, botón «Abrir en WhatsApp» (`waLink`), log y cierre.
- `PasswordModal`: contraseña aleatoria de 10 caracteres, enlace `wa.me` con el texto de acceso (`accessTxt` de la demo), log «Contraseña del panel reseteada». No hay botón «Enviar acceso» aparte.

- [ ] **Step 4: Conectar en la ficha**

- Cabecera: botón `Mensaje` si `remind`.
- Resumen:
  - Datos: `Editar` si `edit`; `Nueva contraseña` si `plan`; sin «Enviar acceso» ni «Cambiar partner».
  - Notas internas: textarea editable (guarda en `onBlur`), visible para ambos roles.
  - Seguimientos: lista, alta con fecha y atajos, completar y borrar; «lo anotó {userName}».
- Uso: checkboxes de puesta en marcha habilitados sólo si `setup`; el CTA «Preguntarle cómo viene» si `remind` y salud `riesgo`/`poco`.

- [ ] **Step 5: Verificar en el navegador**

Run: `cd frontend-tenant && npm run build` → sin errores.
Con `admin`, en `/clients/c3`:
- Editar responsable a «Hernán Sosa Prueba» y vecinos a 260 → cabecera y abono (`$45.000`: 35.000 + 2 tramos de 5.000) se actualizan; historial «Vecinos: 210 → 260»; recargar y confirmar; revertir a 210.
- Escribir una nota y salir del campo; recargar y confirmar que persiste.
- Destildar «Dominio propio conectado» no cambia el 100% porque no es requerido; destildar «Equipo capacitado» → 83% (5 de 6); volver a tildar.
- Agregar un seguimiento para mañana; completarlo; borrar otro.
- «Mensaje»: elegir «Recordatorio de pago», abrir WhatsApp (se abre `wa.me`), historial «Mensaje enviado».
- «Nueva contraseña»: muestra 10 caracteres y el link de WhatsApp.
- Con `operativo`: puede editar datos, notas, seguimientos y mensajes; no ve «Nueva contraseña»; los checkboxes de puesta en marcha están deshabilitados.

- [ ] **Step 6: Commit**

```bash
git add frontend-tenant/src/templates/urbanvoice
git commit -m "feat(urbanvoice): datos, seguimientos y mensajes del cliente"
```

---

### Task 6: Cierre, documentación y verificación final

**Files:**
- Modify: `docs/design/SCREENS.md`
- Modify: `docs/design/DESIGN.md`
- Modify: `docs/dev/DECISIONS.md` (ADR-043)
- Modify: `docs/dev/API.md:869-877`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: documentación del tema y decisión registrada.

- [ ] **Step 1: Actualizar la documentación**

- `SCREENS.md`: fila «Clientes (UrbanVoice)» con `/clients` y `/clients/:clientId`; aclarar que el tema muestra sólo Clientes y que el resto de rutas privadas redirige salvo `/settings`.
- `DESIGN.md`: agregar el tema `urbanvoice` a la lista de temas; documentar la excepción de CSS vendorizado y scopeado (no es un segundo sistema de diseño para las páginas del producto), la fuente Inter local y el store de demo con `localStorage`.
- `DECISIONS.md`: **ADR-043 — Tema UrbanVoice: réplica de la demo con CSS scopeado y datos locales**. Alternativas (port a Tailwind, copia estática, iframe), decisión, consecuencias (el CSS se actualiza contra la demo; los datos desaparecen al limpiar el storage; la integración con API es una etapa posterior).
- `API.md`: `template_id` acepta también `urbanvoice`.
- `CHANGELOG.md`: feature y alcance (tema + Clientes; resto de secciones pendientes).

- [ ] **Step 2: Verificación final completa**

Run: `cd frontend-tenant && npm run lint && npm run build` → sin errores.
Run: `make test` → sin regresiones.
En el navegador, con el stack arriba:
- `admin` y `operativo`: listado, ficha, cuatro tabs, acciones; permisos correctos.
- `localStorage.removeItem('uv-admin-db')` + recargar → vuelve a la semilla; sin errores de consola.
- Cambiar a `default`, `kero` y `devbout`: `/clients` clásico intacto, sin estilos `.uv-admin`.
- 390×844 y 1440×900: sin scroll horizontal ni solapamientos.
- `/dashboard`, `/records`, `/conversations` con el tema → `/clients`; `/settings` abre.

- [ ] **Step 3: Borrar los temporales**

`rm /tmp/uv-demo-check.ts /tmp/scope-uv-css.mjs` (y cualquier captura usada).

- [ ] **Step 4: Commit**

```bash
git add docs CHANGELOG.md
git commit -m "docs(urbanvoice): tema y sección Clientes en la documentación"
```
