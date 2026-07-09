import { useState } from 'react';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { useAppointmentsList, useResources, useServices } from '../../hooks/useAppointments';
import appointmentsService from '../../services/appointments.service';
import type { AppointmentStatus, ManualAppointmentCreate } from '../../types/appointment.types';

const statusLabels: Record<AppointmentStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  completed: 'Completado',
  cancelled: 'Cancelado',
  no_show: 'No se presentó',
};

const statusColors: Record<AppointmentStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-800',
  no_show: 'bg-red-100 text-red-800',
};

const emptyForm: ManualAppointmentCreate = {
  resource_id: '',
  service_id: '',
  start_at: '',
  end_at: '',
  customer_name: '',
  customer_phone: '',
  notes: '',
};

interface Props {
  botId: string;
}

export const AppointmentsTab = ({ botId }: Props) => {
  const { appointments, loading, error, total, page, pages, filters, updateFilters, goToPage, refetch } =
    useAppointmentsList(botId);
  const { resources } = useResources(botId);
  const { services } = useServices(botId);

  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<ManualAppointmentCreate>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleCancel = async (appointmentId: string) => {
    if (!confirm('¿Cancelar este turno?')) return;
    try {
      await appointmentsService.cancelAppointment(botId, appointmentId);
      refetch();
    } catch (err) {
      console.error('Error cancelando turno:', err);
    }
  };

  const handleConfirm = async (appointmentId: string) => {
    try {
      await appointmentsService.confirmAppointment(botId, appointmentId);
      refetch();
    } catch (err) {
      console.error('Error confirmando turno:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.resource_id || !formData.start_at || !formData.end_at) {
      setSaveError('Recurso, inicio y fin son requeridos');
      return;
    }
    try {
      setSaving(true);
      setSaveError(null);
      await appointmentsService.createAppointment(botId, {
        ...formData,
        // datetime-local no trae timezone: se interpreta en la hora local del
        // navegador y se convierte a ISO/UTC antes de mandarlo al backend.
        start_at: new Date(formData.start_at).toISOString(),
        end_at: new Date(formData.end_at).toISOString(),
        service_id: formData.service_id || undefined,
      });
      setShowModal(false);
      setFormData(emptyForm);
      refetch();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error creando el turno');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Turnos</h2>
          <p className="text-gray-800 mt-1">Turnos reservados para este agente</p>
        </div>
        <Button onClick={() => setShowModal(true)} disabled={resources.length === 0}>
          Cargar turno manual
        </Button>
      </div>

      <div className="flex flex-wrap gap-4 mb-6">
        <select
          value={filters.status || ''}
          onChange={(e) => updateFilters({ status: (e.target.value || undefined) as AppointmentStatus | '' })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Todos los estados</option>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={filters.date_from || ''}
          onChange={(e) => updateFilters({ date_from: e.target.value || undefined })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={filters.date_to || ''}
          onChange={(e) => updateFilters({ date_to: e.target.value || undefined })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {loading ? (
        <p className="text-gray-700">Cargando...</p>
      ) : appointments.length === 0 ? (
        <Card>
          <p className="text-gray-700 text-center">No hay turnos que coincidan con el filtro.</p>
        </Card>
      ) : (
        <Card padding="none">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-700 border-b border-gray-200">
                <th className="py-3 px-4">Inicio</th>
                <th className="py-3 px-4">Fin</th>
                <th className="py-3 px-4">Cliente</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((appt) => (
                <tr key={appt.id} className="border-b border-gray-50">
                  <td className="py-3 px-4">{new Date(appt.start_at).toLocaleString()}</td>
                  <td className="py-3 px-4">{new Date(appt.end_at).toLocaleString()}</td>
                  <td className="py-3 px-4">
                    {(appt.metadata.customer_name as string) || appt.customer_ref}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`text-xs px-2 py-1 rounded-full ${statusColors[appt.status]}`}>
                      {statusLabels[appt.status]}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right space-x-3">
                    {appt.status === 'pending' && (
                      <button
                        onClick={() => handleConfirm(appt.id)}
                        className="text-blue-600 hover:text-blue-800 text-xs"
                      >
                        Confirmar
                      </button>
                    )}
                    {(appt.status === 'pending' || appt.status === 'confirmed') && (
                      <button
                        onClick={() => handleCancel(appt.id)}
                        className="text-red-600 hover:text-red-800 text-xs"
                      >
                        Cancelar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {pages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-6">
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="text-sm text-gray-800">
            Página {page} de {pages} ({total} turnos)
          </span>
          <button
            onClick={() => goToPage(page + 1)}
            disabled={page >= pages}
            className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Cargar turno manual</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Recurso</label>
                <select
                  value={formData.resource_id}
                  onChange={(e) => setFormData({ ...formData, resource_id: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="">Elegir recurso...</option>
                  {resources.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Servicio (opcional)</label>
                <select
                  value={formData.service_id}
                  onChange={(e) => setFormData({ ...formData, service_id: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="">Sin servicio específico</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Inicio"
                  type="datetime-local"
                  fullWidth
                  value={formData.start_at}
                  onChange={(e) => setFormData({ ...formData, start_at: e.target.value })}
                />
                <Input
                  label="Fin"
                  type="datetime-local"
                  fullWidth
                  value={formData.end_at}
                  onChange={(e) => setFormData({ ...formData, end_at: e.target.value })}
                />
              </div>
              <Input
                label="Nombre del cliente"
                fullWidth
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
              />
              <Input
                label="Teléfono del cliente (opcional)"
                fullWidth
                value={formData.customer_phone}
                onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
              />
              <Input
                label="Notas (opcional)"
                fullWidth
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
              {saveError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-800 text-sm">{saveError}</p>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" loading={saving}>
                  Crear turno
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppointmentsTab;
