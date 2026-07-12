import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { AppLayout } from '../../components/layout/AppLayout';
import { LoadingPage } from '../../components/common/Spinner';
import { PageHeader } from '../../components/common/PageHeader';
import { Alert } from '../../components/common/Alert';
import { EmptyState } from '../../components/common/EmptyState';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import tenantAdminService from '../../services/tenantAdmin.service';
import type { Plan, Tenant, TenantStatus } from '../../types/tenant.types';

const statusColors: Record<TenantStatus, string> = {
  active: 'bg-green-200 text-green-950',
  suspended: 'bg-red-200 text-red-950',
  trial: 'bg-yellow-200 text-yellow-950',
};

const statusLabels: Record<TenantStatus, string> = {
  active: 'Activo',
  suspended: 'Suspendido',
  trial: 'Prueba',
};

export const Tenants = () => {
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

  if (loading) {
    return <LoadingPage />;
  }

  return (
    <AppLayout>
      <div className="font-editorial bg-white rounded-[1.4rem] shadow-[0_0.5rem_2rem_rgba(0,0,0,0.08)] p-6 sm:p-8">
        <PageHeader
          title="Tenants"
          description={`${total} tenant${total !== 1 ? 's' : ''} en total`}
          titleClassName="font-semibold uppercase tracking-[0.08em]"
          descriptionClassName="text-gray-800"
          actions={
            <Button variant="primary" onClick={() => setShowCreateModal(true)}>
              + Nuevo Tenant
            </Button>
          }
        />

        {error && <Alert variant="error" className="mb-6">Error: {error}</Alert>}

        {tenants.length === 0 ? (
          <Card shadow="none">
            <EmptyState
              icon={<Building2 className="w-8 h-8 text-gray-800" />}
              title="Todavía no hay tenants"
              description="Creá el primer tenant para empezar a dar de alta un cliente"
              titleClassName="text-gray-900 text-xl"
              descriptionClassName="text-gray-900 text-base"
              action={
                <Button variant="primary" onClick={() => setShowCreateModal(true)}>
                  Crear el primer tenant
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tenants.map((tenant) => (
              <Link key={tenant.tenant_id} to={`/admin/tenants/${tenant.tenant_id}`}>
                <Card shadow="none">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-normal text-gray-900">{tenant.name}</h3>
                    <span className={`px-2 py-1 text-base font-medium rounded-full ${statusColors[tenant.status]}`}>
                      {statusLabels[tenant.status]}
                    </span>
                  </div>
                  <p className="text-gray-800 text-base">
                    {tenant.domain || <span className="text-gray-400 italic">sin dominio asignado</span>}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Nuevo Tenant</h2>
            <form onSubmit={handleCreateTenant}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-900 mb-1">Nombre *</label>
                <input
                  type="text"
                  value={newTenant.name}
                  onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Ej: IUS Legal"
                  required
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-900 mb-1">Dominio propio</label>
                <input
                  type="text"
                  value={newTenant.domain}
                  onChange={(e) => setNewTenant({ ...newTenant, domain: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Ej: ius.com.mx"
                />
                <p className="text-xs text-gray-700 mt-1">
                  Se puede completar más adelante, antes de dar de alta el contenedor del tenant.
                </p>
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-900 mb-1">Plan *</label>
                <select
                  value={newTenant.plan_id}
                  onChange={(e) => setNewTenant({ ...newTenant, plan_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
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
