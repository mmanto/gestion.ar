import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from '../../components/layout/AppLayout';
import { LoadingPage } from '../../components/common/Spinner';
import { PageHeader } from '../../components/common/PageHeader';
import { Alert } from '../../components/common/Alert';
import { Button } from '../../components/common/Button';
import { AvatarPicker } from '../../components/common/AvatarPicker';
import { Input } from '../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { FORM_CLASSES, ROW_2, Field } from '../../components/common/FormField';
import tenantAdminService from '../../services/tenantAdmin.service';
import type { Plan, Tenant, TenantStatus } from '../../types/tenant.types';

const statusLabels: Record<TenantStatus, string> = {
  active: 'Activo',
  suspended: 'Suspendido',
  trial: 'Prueba',
};

const statusOptions = (Object.keys(statusLabels) as TenantStatus[]).map((s) => ({
  value: s,
  label: statusLabels[s],
}));

/**
 * Edición de un tenant: datos generales (nombre, dominio, estado, plan) y marca
 * (logos, color, tagline). Es la superficie de edición de la entidad
 * (`edit.href` en `Tenants.tsx`) en lugar del formulario del paquete, porque el
 * schema del paquete no puede renderizar el uploader de los logos
 * (`AvatarPicker` no es uno de sus `kind`). El alta sigue usando el formulario
 * del paquete: la marca se carga después de crear el tenant.
 */
export const TenantEdit = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [status, setStatus] = useState<TenantStatus>('trial');
  const [planId, setPlanId] = useState('');

  const [logoH, setLogoH] = useState<string | undefined>();
  const [logoV, setLogoV] = useState<string | undefined>();
  const [color, setColor] = useState('#25357a');
  const [tagline, setTagline] = useState('');

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      setLoading(true);
      const [tenantData, plansData] = await Promise.all([
        tenantAdminService.getTenant(tenantId),
        tenantAdminService.listPlans(),
      ]);
      setTenant(tenantData);
      setName(tenantData.name);
      setDomain(tenantData.domain || '');
      setStatus(tenantData.status);
      setPlanId(tenantData.plan_id);
      setLogoH(tenantData.branding?.logo_url_horizontal || tenantData.branding?.logo_url || undefined);
      setLogoV(tenantData.branding?.logo_url_vertical || undefined);
      setColor(tenantData.branding?.primary_color || '#25357a');
      setTagline(tenantData.branding?.tagline || '');
      setPlans(plansData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando el tenant');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!tenantId || !tenant) return;
    setSaving(true);
    setError(null);
    try {
      await tenantAdminService.updateTenant(tenantId, {
        name: name.trim(),
        domain: domain.trim() || undefined,
        status,
        plan_id: planId,
        // El backend reemplaza el dict completo de `branding`: se preservan las
        // claves que esta pantalla no edita (p. ej. el `logo_url` legacy o
        // `sidebar_visible` que siguen en los datos de algunos tenants).
        branding: {
          ...(tenant.branding ?? {}),
          logo_url_horizontal: logoH || undefined,
          logo_url_vertical: logoV || undefined,
          primary_color: color,
          tagline: tagline || undefined,
        },
      });
      navigate('/admin/tenants');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el tenant');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingPage />;
  if (!tenant)
    return (
      <AppLayout>
        <Alert variant="error">Tenant no encontrado</Alert>
      </AppLayout>
    );

  const planItems = plans.map((p) => ({
    value: p.plan_id,
    label: `${p.name} — $${p.amount.toLocaleString('es-AR')}/${p.periodicity === 'monthly' ? 'mes' : 'año'}`,
  }));

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <nav>
          <ol className="flex items-center gap-2 text-xs text-muted-foreground">
            <li>
              <Link to="/admin/tenants" className="hover:text-foreground">
                Tenants
              </Link>
            </li>
            <li>/</li>
            <li className="text-foreground">{tenant.name}</li>
          </ol>
        </nav>

        <PageHeader
          title={`Editar ${tenant.name}`}
          description="Datos generales y marca del tenant"
        />

        {error && <Alert variant="error">Error: {error}</Alert>}

        <form onSubmit={handleSubmit} className={FORM_CLASSES}>
          <div className={ROW_2}>
            <Field label="Nombre" htmlFor="edit-tenant-name">
              <Input
                id="edit-tenant-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                minLength={2}
                maxLength={100}
                required
              />
            </Field>
            <Field
              label="Dominio propio"
              htmlFor="edit-tenant-domain"
              hint="Dominio propio del tenant (ej. pachoteayuda.ar) — no un subdominio de intellify.pro."
            >
              <Input
                id="edit-tenant-domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="ej. pachoteayuda.ar"
              />
            </Field>
          </div>

          <div className={ROW_2}>
            <Field label="Estado" htmlFor="edit-tenant-status">
              <Select
                items={statusOptions}
                value={status}
                onValueChange={(next) => setStatus((next as TenantStatus) ?? 'trial')}
              >
                <SelectTrigger id="edit-tenant-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Plan" htmlFor="edit-tenant-plan">
              <Select items={planItems} value={planId} onValueChange={(next) => setPlanId(next ?? '')}>
                <SelectTrigger id="edit-tenant-plan" className="w-full">
                  <SelectValue placeholder="Elegí un plan" />
                </SelectTrigger>
                <SelectContent>
                  {planItems.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className={ROW_2}>
            <Field label="Logo horizontal">
              <AvatarPicker
                value={logoH}
                onChange={setLogoH}
                fallbackLabel={tenant.name.charAt(0) || '?'}
              />
            </Field>
            <Field label="Logo vertical">
              <AvatarPicker
                value={logoV}
                onChange={setLogoV}
                fallbackLabel={tenant.name.charAt(0) || '?'}
              />
            </Field>
          </div>

          <div className={ROW_2}>
            <Field label="Color principal">
              <div className="flex h-7 items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-7 w-10 cursor-pointer rounded-sm border border-input p-0.5"
                />
                <span className="font-mono text-xs text-muted-foreground">{color}</span>
              </div>
            </Field>
            <Field label="Tagline" htmlFor="edit-tenant-tagline">
              <Input
                id="edit-tenant-tagline"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                maxLength={200}
                placeholder="Ej: Abogados de confianza"
              />
            </Field>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => navigate('/admin/tenants')}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
};

export default TenantEdit;
