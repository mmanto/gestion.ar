import { useEffect, useState } from 'react';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { useServices, useResources } from '../../hooks/useAppointments';
import appointmentsService from '../../services/appointments.service';
import type { Service, ServiceCreate, Resource } from '../../types/appointment.types';

const emptyForm: ServiceCreate = {
  name: '',
  duration_minutes: 30,
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
};

interface Props {
  botId: string;
  onServicesChanged?: () => void;
}

const ServiceResources = ({ botId, service }: { botId: string; service: Service }) => {
  const { resources } = useResources(botId);
  const [attached, setAttached] = useState<Resource[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setAttached(await appointmentsService.listServiceResources(botId, service.id));
    } catch {
      // silencioso, no crítico para el resto de la pestaña
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service.id]);

  const attachedIds = new Set(attached.map((r) => r.id));
  const available = resources.filter((r) => !attachedIds.has(r.id));

  const handleAttach = async () => {
    if (!selectedResourceId) return;
    try {
      setBusy(true);
      await appointmentsService.attachResourceToService(botId, service.id, selectedResourceId);
      setSelectedResourceId('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleDetach = async (resourceId: string) => {
    try {
      setBusy(true);
      await appointmentsService.detachResourceFromService(botId, service.id, resourceId);
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-gray-200">
      <p className="text-xs font-medium text-gray-700 mb-2">Recursos que ofrecen este servicio</p>
      {attached.length === 0 ? (
        <p className="text-xs text-gray-400 mb-2">Ninguno asociado todavía</p>
      ) : (
        <div className="flex flex-wrap gap-2 mb-2">
          {attached.map((r) => (
            <span key={r.id} className="text-xs bg-gray-100 rounded-full px-2 py-1 flex items-center gap-1">
              {r.name}
              <button
                onClick={() => handleDetach(r.id)}
                disabled={busy}
                className="text-gray-700 hover:text-red-600"
                aria-label={`Quitar ${r.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {available.length > 0 && (
        <div className="flex gap-2">
          <select
            value={selectedResourceId}
            onChange={(e) => setSelectedResourceId(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1"
          >
            <option value="">Elegir recurso...</option>
            {available.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={handleAttach} disabled={!selectedResourceId || busy}>
            Asociar
          </Button>
        </div>
      )}
    </div>
  );
};

export const ServicesTab = ({ botId, onServicesChanged }: Props) => {
  const { services, loading, error, refetch } = useServices(botId);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [formData, setFormData] = useState<ServiceCreate>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormData(emptyForm);
    setSaveError(null);
    setShowModal(true);
  };

  const openEdit = (service: Service) => {
    setEditing(service);
    setFormData({
      name: service.name,
      duration_minutes: service.duration_minutes,
      buffer_before_minutes: service.buffer_before_minutes,
      buffer_after_minutes: service.buffer_after_minutes,
      min_cancellation_notice_minutes: service.min_cancellation_notice_minutes ?? undefined,
    });
    setSaveError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || formData.duration_minutes <= 0) {
      setSaveError('Nombre y duración (mayor a 0) son requeridos');
      return;
    }
    try {
      setSaving(true);
      setSaveError(null);
      if (editing) {
        await appointmentsService.updateService(botId, editing.id, formData);
      } else {
        await appointmentsService.createService(botId, formData);
      }
      setShowModal(false);
      refetch();
      onServicesChanged?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error guardando el servicio');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (service: Service) => {
    if (!confirm(`¿Eliminar el servicio "${service.name}"?`)) return;
    try {
      await appointmentsService.deleteService(botId, service.id);
      refetch();
      onServicesChanged?.();
    } catch (err) {
      console.error('Error eliminando servicio:', err);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Servicios</h2>
          <p className="text-gray-800 mt-1">Lo que se reserva (consulta, alquiler, clase, etc.)</p>
        </div>
        <Button onClick={openCreate}>Nuevo Servicio</Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {loading ? (
        <p className="text-gray-700">Cargando...</p>
      ) : services.length === 0 ? (
        <Card>
          <p className="text-gray-700 text-center">No hay servicios configurados todavía.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {services.map((service) => (
            <Card key={service.id}>
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-gray-900">{service.name}</h3>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(service)}>
                    Editar
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => handleDelete(service)}>
                    Eliminar
                  </Button>
                </div>
              </div>
              <div className="text-sm text-gray-700 space-y-1">
                <p>Duración: {service.duration_minutes} min</p>
                {(service.buffer_before_minutes > 0 || service.buffer_after_minutes > 0) && (
                  <p>
                    Buffers: {service.buffer_before_minutes}min antes / {service.buffer_after_minutes}min después
                  </p>
                )}
              </div>
              <ServiceResources botId={botId} service={service} />
            </Card>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {editing ? 'Editar Servicio' : 'Nuevo Servicio'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Nombre"
                fullWidth
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
              <Input
                label="Duración (minutos)"
                type="number"
                min={1}
                fullWidth
                value={formData.duration_minutes}
                onChange={(e) => setFormData({ ...formData, duration_minutes: Number(e.target.value) })}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Buffer antes (min)"
                  type="number"
                  min={0}
                  fullWidth
                  value={formData.buffer_before_minutes}
                  onChange={(e) => setFormData({ ...formData, buffer_before_minutes: Number(e.target.value) })}
                />
                <Input
                  label="Buffer después (min)"
                  type="number"
                  min={0}
                  fullWidth
                  value={formData.buffer_after_minutes}
                  onChange={(e) => setFormData({ ...formData, buffer_after_minutes: Number(e.target.value) })}
                />
              </div>
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
                  Guardar
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServicesTab;
