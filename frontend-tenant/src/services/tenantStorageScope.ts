/**
 * Aislamiento de la sesión entre tenants que comparten origen.
 *
 * En los dominios por Host (o en el APK) cada tenant tiene su propio
 * `localStorage`, así que `token`/`user` no se mezclan. En la URL interna
 * (`https://intellify.pro/<slug>/…`) todos los tenants viven en el mismo
 * origen: sin prefijo, el token de un tenant se reutilizaría en la página del
 * otro. Por eso las keys se escriben con el `tenant_id` adelante
 * (`<tenant_id>:token`); sin tenant resuelto todavía (antes de que
 * `TenantContext` lo traiga) las keys quedan sin prefijo, como siempre.
 */

let scope: string | null = null;

/** Fija el tenant con el que se prefijan las keys del storage. */
export function setTenantStorageScope(tenantId: string | null): void {
  scope = tenantId;
}

/** Tenant actual del scope (`null` = sin prefijo, comportamiento por Host). */
export function getTenantStorageScope(): string | null {
  return scope;
}

/** Key del storage con el prefijo del tenant, si hay uno resuelto. */
export function scopedStorageKey(key: string): string {
  return scope ? `${scope}:${key}` : key;
}
