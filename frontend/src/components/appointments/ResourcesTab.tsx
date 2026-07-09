import { useState } from 'react';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { useResources } from '../../hooks/useAppointments';
import appointmentsService from '../../services/appointments.service';
import type { Resource, ResourceCreate } from '../../types/appointment.types';

const emptyForm: ResourceCreate = { name: '', category: '', capacity: 1, timezone: '' };

interface Props {
  botId: string;
  onResourcesChanged?: () => void;
}

export const ResourcesTab = ({ botId, onResourcesChanged }: Props) => {
  const { resources, loading, error, refetch } = useResources(botId);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [formData, setFormData] = useState<ResourceCreate>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormData(emptyForm);
    setSaveError(null);
    setShowModal(true);
  };

  const openEdit = (resource: Resource) => {
    setEditing(resource);
    setFormData({
      name: resource.name,
      category: resource.category || '',
      capacity: resource.capacity,
      timezone: resource.timezone || '',
    });
    setSaveError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setSaveError('El nombre es requerido');
      return;
    }
    try {
      setSaving(true);
      setSaveError(null);
      if (editing) {
        await appointmentsService.updateResource(botId, editing.id, formData);
      } else {
        await appointmentsService.createResource(botId, formData);
      }
      setShowModal(false);
      refetch();
      onResourcesChanged?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error guardando el recurso');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (resource: Resource) => {
    if (!confirm(`¿Eliminar el recurso "${resource.name}"?`)) return;
    try {
      await appointmentsService.deleteResource(botId, resource.id);
      refetch();
      onResourcesChanged?.();
    } catch (err) {
      console.error('Error eliminando recurso:', err);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Recursos</h2>
          <p className="text-gray-800 mt-1">Consultorios, canchas, mesas u otro recurso reservable</p>
        </div>
        <Button onClick={openCreate}>Nuevo Recurso</Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {loading ? (
        <p className="text-gray-700">Cargando...</p>
      ) : resources.length === 0 ? (
        <Card>
          <p className="text-gray-700 text-center">No hay recursos configurados todavía.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {resources.map((resource) => (
            <Card key={resource.id}>
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-gray-900">{resource.name}</h3>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    resource.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {resource.is_active ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              <div className="text-sm text-gray-700 space-y-1 mb-4">
                {resource.category && <p>Categoría: {resource.category}</p>}
                <p>Capacidad: {resource.capacity}</p>
                {resource.timezone && <p>Zona horaria: {resource.timezone}</p>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(resource)}>
                  Editar
                </Button>
                <Button size="sm" variant="danger" onClick={() => handleDelete(resource)}>
                  Eliminar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {editing ? 'Editar Recurso' : 'Nuevo Recurso'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Nombre"
                fullWidth
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
              <Input
                label="Categoría (opcional)"
                fullWidth
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              />
              <Input
                label="Capacidad"
                type="number"
                min={1}
                fullWidth
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: Number(e.target.value) })}
              />
              <Input
                label="Zona horaria (opcional, ej. America/Argentina/Buenos_Aires)"
                fullWidth
                value={formData.timezone}
                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
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

export default ResourcesTab;
