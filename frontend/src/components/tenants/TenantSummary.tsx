import { Badge } from '../ui/badge';
import { Field, FORM_CLASSES, FormGrid } from '../common/FormField';
import type { Plan, Tenant, TenantStatus } from '../../types/tenant.types';

const statusBadges: Record<
  TenantStatus,
  { label: string; variant: 'success' | 'warning' | 'destructive' }
> = {
  active: { label: 'Activo', variant: 'success' },
  trial: { label: 'Prueba', variant: 'warning' },
  suspended: { label: 'Suspendido', variant: 'destructive' },
};

/**
 * Resumen del tenant que abre la grilla (`detail.surface`), con la rejilla
 * canónica de 1/2/3 columnas. Reemplaza los campos por defecto del paquete:
 * `DetailEntity` declara `@container` en el mismo `<dl>` que usa `@md`, así que
 * la consulta no aplica y el detalle queda en una sola columna.
 */
export function TenantSummary({ tenant, plans }: { tenant: Tenant; plans: Plan[] }) {
  const status = statusBadges[tenant.status] ?? statusBadges.trial;
  const planName = plans.find((plan) => plan.plan_id === tenant.plan_id)?.name;
  const created = tenant.created_at
    ? new Date(tenant.created_at).toLocaleDateString('es-AR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';

  return (
    <div className={FORM_CLASSES}>
      <FormGrid>
        <Field label="Nombre">
          <p className="text-sm font-medium text-foreground">{tenant.name}</p>
        </Field>
        <Field label="Dominio propio">
          <p className="text-sm text-foreground">{tenant.domain || '—'}</p>
        </Field>
        <Field label="Estado">
          <div>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
        </Field>
        <Field label="Plan">
          <p className="text-sm text-foreground">{planName || '—'}</p>
        </Field>
        <Field label="Alta">
          <p className="text-sm text-foreground">{created}</p>
        </Field>
      </FormGrid>
    </div>
  );
}