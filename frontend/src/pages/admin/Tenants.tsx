import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import {
  DataTable,
  defineTableDTO,
  EntityNavigateProvider,
  EntityViewProvider,
  type TableDTO,
} from '@mmanto/devbout-ui';
import { AppLayout } from '../../components/layout/AppLayout';
import { LoadingPage } from '../../components/common/Spinner';
import { PageHeader } from '../../components/common/PageHeader';
import { Alert } from '../../components/common/Alert';
import { EmptyState } from '../../components/common/EmptyState';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import tenantAdminService from '../../services/tenantAdmin.service';
import type { Plan, Tenant, TenantStatus } from '../../types/tenant.types';

const statusLabels: Record<TenantStatus, string> = {
  active: 'Activo',
  suspended: 'Suspendido',
  trial: 'Prueba',
};

/**
 * Chip de estado con tokens (equivalente a un `<Badge variant="success|warning|
 * destructive">`; el componente Badge del paquete llega con la próxima versión).
 */
const statusClasses: Record<TenantStatus, string> = {
  active: 'bg-success/15 text-success',
  suspended: 'bg-destructive/15 text-destructive',
  trial: 'bg-warning/15 text-warning',
};

export const Tenants = () => {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTenant, setNewTenant] = useState({ name: '', domain: '', plan_id: '' });
  const [plans, setPlans] = useState<Plan[]>([]);

  const fetchTenants = async () => {
    try {
      setLoading(true);
      const result = await tenantAdminService.listTenants(1, 100);
      setTenants(result.tenants);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando tenants');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
    tenantAdminService.listPlans()
      .then((data) => {
        setPlans(data);
        if (data.length > 0) setNewTenant((prev) => ({ ...prev, plan_id: data[0].plan_id }));
      })
      .catch(() => {});
  }, []);

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenant.name || !newTenant.plan_id) return;

    try {
      setCreating(true);
      await tenantAdminService.createTenant({
        name: newTenant.name,
        domain: newTenant.domain || undefined,
        plan_id: newTenant.plan_id,
      });
      setShowCreateModal(false);
      setNewTenant({ name: '', domain: '', plan_id: plans[0]?.plan_id || '' });
      fetchTenants();
    } catch (err) {
      console.error('Error creating tenant:', err);
    } finally {
      setCreating(false);
    }
  };

  /**
   * DTO de la grilla: la tabla se encarga del buscador, el orden, la
   * visibilidad de columnas y la paginación. El alta sigue en el modal de la
   * página (crea contra la API y recarga la lista).
   */
  const dto = useMemo<TableDTO<Tenant>>(
    () =>
      defineTableDTO<Tenant>({
        rowId: (tenant) => tenant.tenant_id,
        search: { columnId: 'name', placeholder: 'Buscar tenant' },
        columnLabels: {
          name: 'Tenant',
          domain: 'Dominio',
          status: 'Estado',
        },
        columns: [
          { id: 'name', accessorKey: 'name', header: 'Tenant' },
          {
            id: 'domain',
            header: 'Dominio',
            cell: ({ row }) =>
              row.original.domain || (
                <span className="italic text-muted-foreground">sin dominio asignado</span>
              ),
          },
          {
            id: 'status',
            header: 'Estado',
            cell: ({ row }) => (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusClasses[row.original.status]}`}
              >
                {statusLabels[row.original.status]}
              </span>
            ),
          },
        ],
        detail: {
          label: 'Ver detalle',
          title: (tenant) => tenant.name,
          href: (tenant) => `/admin/tenants/${tenant.tenant_id}`,
        },
      }),
    []
  );

  if (loading) {
    return <LoadingPage />;
  }

  return (
    <AppLayout>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Tenants"
          description={`${total} tenant${total !== 1 ? 's' : ''} en total`}
          actions={
            <Button variant="primary" onClick={() => setShowCreateModal(true)}>
              + Nuevo Tenant
            </Button>
          }
        />

        {error && <Alert variant="error">Error: {error}</Alert>}

        {tenants.length === 0 ? (
          <Card shadow="none">
            <EmptyState
              icon={<Building2 className="w-8 h-8" />}
              title="Todavía no hay tenants"
              description="Creá el primer tenant para empezar a dar de alta un cliente"
              action={
                <Button variant="primary" onClick={() => setShowCreateModal(true)}>
                  Crear el primer tenant
                </Button>
              }
            />
          </Card>
        ) : (
          <EntityNavigateProvider navigate={navigate}>
            <EntityViewProvider>
              <DataTable dto={dto} data={tenants} />
            </EntityViewProvider>
          </EntityNavigateProvider>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card text-card-foreground rounded-xl border border-border shadow-md p-6 w-full max-w-md">
            <h2 className="text-base font-medium text-foreground mb-4">Nuevo Tenant</h2>
            <form onSubmit={handleCreateTenant}>
              <div className="mb-4">
                <label className="block text-xs font-medium text-foreground mb-1">Nombre *</label>
                <input
                  type="text"
                  value={newTenant.name}
                  onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
                  className="w-full rounded-md border border-input bg-input/20 px-2 py-1.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  placeholder="Ej: IUS Legal"
                  required
                />
              </div>
              <div className="mb-6">
                <label className="block text-xs font-medium text-foreground mb-1">Dominio propio</label>
                <input
                  type="text"
                  value={newTenant.domain}
                  onChange={(e) => setNewTenant({ ...newTenant, domain: e.target.value })}
                  className="w-full rounded-md border border-input bg-input/20 px-2 py-1.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  placeholder="Ej: ius.com.mx"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Se puede completar más adelante, antes de dar de alta el contenedor del tenant.
                </p>
              </div>
              <div className="mb-6">
                <label className="block text-xs font-medium text-foreground mb-1">Plan *</label>
                <select
                  value={newTenant.plan_id}
                  onChange={(e) => setNewTenant({ ...newTenant, plan_id: e.target.value })}
                  className="w-full rounded-md border border-input bg-input/20 px-2 py-1.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  required
                >
                  {plans.length === 0 && <option value="">No hay planes creados</option>}
                  {plans.map((p) => (
                    <option key={p.plan_id} value={p.plan_id}>
                      {p.name} — ${p.amount.toLocaleString('es-AR')}/{p.periodicity === 'monthly' ? 'mes' : 'año'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" loading={creating}>
                  Crear Tenant
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default Tenants;
