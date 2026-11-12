/**
 * Nombre interno del tenant en la URL del apex (`https://intellify.pro/<slug>/…`).
 *
 * El apex sirve el mismo contenedor `frontend-tenant` para todos los tenants, así
 * que el Host no alcanza para distinguirlos: el tenant sale del primer segmento
 * del path y React Router monta el SPA con ese prefijo como `basename`.
 *
 * El backend es la fuente de verdad del formato y de la lista de reservados
 * (`backend/app/tenant_slug.py`); esto sólo replica lo mínimo para no interpretar
 * como tenant una ruta de infraestructura (`/api/…`, `/icons/…`, `/login`).
 */

export const INTERNAL_TENANT_HOST = 'intellify.pro';

/**
 * Panel de administración general: destino del apex cuando no hay tenant en el
 * path (`https://intellify.pro/` o una ruta reservada como `/login`). El sitio
 * de marketing no vive acá: se sirve en `www.intellify.pro`.
 */
export const ADMIN_PANEL_URL = 'https://admin.intellify.pro';

/** Espejo de `RESERVED_TENANT_SLUGS` del backend. */
export const RESERVED_TENANT_SLUGS: Record<string, true> = {
  api: true,
  ws: true,
  assets: true,
  icons: true,
  'tenant-icons': true,
  'tenant-config.js': true,
  'sw.js': true,
  'manifest.webmanifest': true,
  'favicon.ico': true,
  'robots.txt': true,
  'sitemap.xml': true,
  '.well-known': true,
  login: true,
  register: true,
  registro: true,
  chat: true,
  u: true,
  logout: true,
  admin: true,
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/;

/**
 * ¿La página se sirve en el host interno? Además del apex, se acepta el alias
 * `<host>.localhost`: cualquier `*.localhost` resuelve a loopback (RFC 6761), así
 * que en dev la URL interna se prueba en `http://intellify.pro.localhost:5174/<slug>/`
 * sin tocar DNS ni /etc/hosts (mismo criterio que el alias de los dominios por Host).
 */
export function isInternalTenantHost(host: string = window.location.hostname): boolean {
  const normalized = host.toLowerCase();
  return normalized === INTERNAL_TENANT_HOST || normalized === `${INTERNAL_TENANT_HOST}.localhost`;
}

/**
 * Slug del tenant según el path actual, o `null` si la página no está en el host
 * interno o el primer segmento no es un nombre interno válido (apex `/`, `/login`,
 * `/api/…`, un asset…).
 */
export function getInternalTenantSlug(): string | null {
  if (!isInternalTenantHost()) return null;
  const first = window.location.pathname.split('/').filter(Boolean)[0];
  if (!first) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(first).toLowerCase();
  } catch {
    return null;
  }
  if (!SLUG_RE.test(decoded) || RESERVED_TENANT_SLUGS[decoded]) return null;
  return decoded;
}

/** Prefijo de la app en el path: `''` en los dominios por Host, `/<slug>` en el apex. */
export function tenantBasePath(): string {
  const slug = getInternalTenantSlug();
  return slug ? `/${slug}` : '';
}

/** Path absoluto de la app con el prefijo del tenant (`tenantPath('/login')`). */
export function tenantPath(path: string): string {
  return `${tenantBasePath()}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Origen público del tenant, sin barra final: base de links y QR. */
export function tenantUrl(): string {
  return `${window.location.origin}${tenantBasePath()}`;
}

/**
 * Quita el prefijo del tenant de un pathname del navegador, para comparar contra
 * las rutas de React Router (que ya están sin prefijo por el `basename`).
 */
export function stripTenantBase(pathname: string): string {
  const base = tenantBasePath();
  if (!base || !pathname.startsWith(base)) return pathname;
  const stripped = pathname.slice(base.length);
  return stripped.startsWith('/') ? stripped : `/${stripped}`;
}
