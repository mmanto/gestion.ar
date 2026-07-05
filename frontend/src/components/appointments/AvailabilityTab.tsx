import { useEffect, useState } from 'react';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { useResources } from '../../hooks/useAppointments';
import appointmentsService from '../../services/appointments.service';
import type { AvailabilityRule, AvailabilityRuleCreate } from '../../types/appointment.types';

const WEEKDAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const emptyForm: AvailabilityRuleCreate = { weekday: 0, start_time: '09:00', end_time: '18:00' };

interface Props {
  botId: string;
}

export const AvailabilityTab = ({ botId }: Props) => {
  const { resources, loading: loadingResources } = useResources(botId);
  const [selectedResourceId, setSelectedResourceId] = useState('');
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [formData, setFormData] = useState<AvailabilityRuleCreate>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedResourceId && resources.length > 0) {
      setSelectedResourceId(resources[0].id);
    }
  }, [resources, selectedResourceId]);

  const loadRules = async () => {
    if (!selectedResourceId) return;
    try {
      setLoadingRules(true);
      setRules(await appointmentsService.getAvailabilityRules(botId, selectedResourceId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando la disponibilidad');
    } finally {
      setLoadingRules(false);
    }
  };

  useEffect(() => {
    loadRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedResourceId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResourceId) return;
    try {
      setSaving(true);
      setError(null);
      await appointmentsService.createAvailabilityRule(botId, selectedResourceId, formData);
      setFormData(emptyForm);
      await loadRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creando la regla');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rule: AvailabilityRule) => {
    if (!selectedResourceId) return;
    try {
      await appointmentsService.deleteAvailabilityRule(botId, selectedResourceId, rule.id);
      await loadRules();
    } catch (err) {
      console.error('Error eliminando regla:', err);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Disponibilidad</h2>
        <p className="text-gray-600 mt-1">Horarios semanales en los que un recurso acepta turnos</p>
      </div>

      {loadingResources ? (
        <p className="text-gray-500">Cargando recursos...</p>
      ) : resources.length === 0 ? (
        <Card>
          <p className="text-gray-500 text-center">Primero creá un recurso en la pestaña "Recursos".</p>
        </Card>
      ) : (
        <>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Recurso</label>
            <select
              value={selectedResourceId}
              onChange={(e) => setSelectedResourceId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2"
            >
              {resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          <Card className="mb-6">
            <h3 className="font-semibold text-gray-900 mb-4">Reglas actuales</h3>
            {loadingRules ? (
              <p className="text-gray-500">Cargando...</p>
            ) : rules.length === 0 ? (
              <p className="text-gray-500">Sin reglas de disponibilidad todavía.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="py-2">Día</th>
                    <th className="py-2">Desde</th>
                    <th className="py-2">Hasta</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <tr key={rule.id} className="border-b border-gray-50">
                      <td className="py-2">{WEEKDAY_LABELS[rule.weekday]}</td>
                      <td className="py-2">{rule.start_time}</td>
                      <td className="py-2">{rule.end_time}</td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => handleDelete(rule)}
                          className="text-red-600 hover:text-red-800 text-xs"
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">Agregar regla</h3>
            <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Día</label>
                <select
                  value={formData.weekday}
                  onChange={(e) => setFormData({ ...formData, weekday: Number(e.target.value) })}
                  className="border border-gray-300 rounded-lg px-3 py-2"
                >
                  {WEEKDAY_LABELS.map((label, idx) => (
                    <option key={idx} value={idx}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                label="Desde"
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
              />
              <Input
                label="Hasta"
                type="time"
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
              />
              <Button type="submit" loading={saving}>
                Agregar
              </Button>
            </form>
          </Card>
        </>
      )}
    </div>
  );
};

export default AvailabilityTab;
