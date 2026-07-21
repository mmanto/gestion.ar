// Los assets de tenant (logos) vienen del backend como paths relativos
// (ej: /api/uploads/tenants/xxx.png) — ver TenantBranding. En el deploy web
// eso resuelve bien porque el frontend se sirve desde el mismo origen que
// la API (mismo dominio o proxy de nginx). En la app nativa (Capacitor) el
// WebView tiene un origen fijo propio (https://localhost) distinto al de
// VITE_API_URL, así que hay que resolver el path contra el origen real de
// la API en vez de dejarlo relativo al origen de la app.
export function resolveAssetUrl(path?: string): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;

  const apiUrl = import.meta.env.VITE_API_URL || '';
  if (!apiUrl.startsWith('http')) return path;

  try {
    return `${new URL(apiUrl).origin}${path}`;
  } catch {
    return path;
  }
}
