import { useEffect, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { AppLayout } from '../../components/layout/AppLayout';
import { LoadingPage } from '../../components/common/Spinner';
import { PageHeader } from '../../components/common/PageHeader';
import { Alert } from '../../components/common/Alert';
import { EmptyState } from '../../components/common/EmptyState';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import tenantAdminService from '../../services/tenantAdmin.service';
import type { Plan, PlanPeriodicity } from '../../types/tenant.types';

const periodicityLabels: Record<PlanPeriodicity, string> = {
  monthly: 'Mensual',
  annual: 'Anual',
};

const emptyForm = { name: '', description: '', amount: '', periodicity: 'monthly' as PlanPeriodicity };

export const Plans = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      setPlans(await tenantAdminService.listPlans());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando planes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const openCreateModal = () => {
    setEditingPlan(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEditModal = (plan: Plan) => {
    setEditingPlan(plan);
    setForm({
      name: plan.name,
      description: plan.description || '',
      amount: String(plan.amount),
      periodicity: plan.periodicity,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.amount) return;

    try {
      setSaving(true);
      const payload = {
        name: form.name,
        description: form.description || undefined,
        amount: parseFloat(form.amount),
        periodicity: form.periodicity,
      };
      if (editingPlan) {
        await tenantAdminService.updatePlan(editingPlan.plan_id, payload);
      } else {
        await tenantAdminService.createPlan(payload);
      }
      setShowModal(false);
      fetchPlans();
    } catch (err) {
      console.error('Error guardando plan:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (plan: Plan) => {
    if (!confirm(`¿Eliminar el plan "${plan.name}"?`)) return;
    try {
      await tenantAdminService.deletePlan(plan.plan_id);
      fetchPlans();
    } catch {
      alert('No se pudo eliminar: puede tener tenants suscriptos.');
    }
  };

  if (loading) {
    return <LoadingPage />;
  }

  return (
    <AppLayout>
      <div className="font-editorial bg-white rounded-[1.4rem] shadow-[0_0.5rem_2rem_rgba(0,0,0,0.08)] p-6 sm:p-8">
        <PageHeader
          title="Planes"
          description={`${plans.length} plan${plans.length !== 1 ? 'es' : ''} en total`}
          titleClassName="font-light uppercase tracking-[0.08em]"
          descriptionClassName="text-gray-800"
          actions={
            <Button variant="primary" onClick={openCreateModal}>
              + Nuevo Plan
            </Button>
          }
        />

        {error && <Alert variant="error" className="mb-6">Error: {error}</Alert>}

        {plans.length === 0 ? (
          <Card shadow="none">
            <EmptyState
              icon={<CreditCard className="w-8 h-8 text-gray-800" />}
              title="Todavía no hay planes"
              description="Creá el primer plan para poder suscribir tenants"
              titleClassName="text-gray-900 text-xl"
              descriptionClassName="text-gray-900 text-base"
              action={
                <Button variant="primary" onClick={openCreateModal}>
                  Crear el primer plan
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <Card key={plan.plan_id} shadow="none">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-lg font-normal text-gray-900">{plan.name}</h3>
                  <span className="px-2 py-1 text-base font-medium rounded-full bg-gray-200 text-gray-950">
                    {periodicityLabels[plan.periodicity]}
                  </span>
                </div>
                <p className="text-2xl font-semibold text-gray-900 mb-2">
                  ${plan.amount.toLocaleString('es-AR')}
                </p>
                {plan.description && (
                  <p className="text-gray-900 text-base mb-4">{plan.description}</p>
                )}
                <div className="flex gap-3 mt-4">
                  <Button variant="outline" onClick={() => openEditModal(plan)}>
                    Editar
                  </Button>
                  <Button variant="danger" onClick={() => handleDelete(plan)}>
                    Eliminar
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingPlan ? 'Editar Plan' : 'Nuevo Plan'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-900 mb-1">Nombre *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Ej: Plan Pro"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-900 mb-1">Descripción</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  rows={3}
                  placeholder="Descripción opcional del plan"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-900 mb-1">Monto *</label>
                <input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  min={0}
                  step="0.01"
                  required
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-900 mb-1">Periodicidad *</label>
                <select
                  value={form.periodicity}
                  onChange={(e) => setForm({ ...form, periodicity: e.target.value as PlanPeriodicity })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="monthly">Mensual</option>
                  <option value="annual">Anual</option>
                </select>
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" loading={saving}>
                  {editingPlan ? 'Guardar cambios' : 'Crear Plan'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default Plans;
