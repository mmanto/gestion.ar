import type { PartnerTenant, PartnerTenantStatus } from '../../../types/partnerTenant.types';

/** Tono del badge (`bdg`) y etiqueta por estado del tenant hijo. */
export const STATUS_META: Record<PartnerTenantStatus, { label: string; tone: string }> = {
  active: { label: 'Activo', tone: 'ok' },
  trial: { label: 'En prueba', tone: 'info' },
  suspended: { label: 'Suspendido', tone: 'sus' },
};

export function statusMeta(status: PartnerTenantStatus) {
  return STATUS_META[status] ?? STATUS_META.active;
}

export function tenantInitials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

/** Color de marca del cliente para el avatar (branding > azul UrbanVoice). */
export function tenantColor(t: Pick<PartnerTenant, 'branding'>): string {
  const color = t.branding?.primary_color;
  return typeof color === 'string' && color ? color : '#087CF5';
}

/**
 * URL pública del cliente: dominio propio si lo tiene; si no, la URL interna
 * del apex (`intellify.pro/<slug>`), que siempre resuelve.
 */
export function tenantUrl(t: Pick<PartnerTenant, 'domain' | 'slug'>): string | null {
  if (t.domain) return `https://${t.domain}`;
  if (t.slug) return `https://intellify.pro/${t.slug}`;
  return null;
}

export function tenantUrlLabel(t: Pick<PartnerTenant, 'domain' | 'slug'>): string {
  return t.domain || (t.slug ? `intellify.pro/${t.slug}` : '—');
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Los clientes del panel son los hijos; el tenant base no se lista. */
export function isClientOf(baseTenantId: string | null | undefined, t: PartnerTenant): boolean {
  return Boolean(baseTenantId) && t.parent_tenant_id === baseTenantId;
}

export function clientMatches(t: PartnerTenant, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [t.name, t.slug ?? '', t.domain ?? ''].some((value) => value.toLowerCase().includes(q));
}
