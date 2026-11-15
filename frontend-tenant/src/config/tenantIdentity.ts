/**
 * Clave estable para reconocer a un tenant por slug o, si el tenant viejo no
 * tiene slug, por su nombre: `urbanvoice`, `urban-voice` y «Urban Voice»
 * normalizan al mismo valor. La usan el tema por defecto del backoffice
 * (tenantTemplateDefaults) y la landing propia (tenantLanding).
 */
export function tenantIdentityKey(slug?: string | null, name?: string | null): string {
  return String(slug || name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}
