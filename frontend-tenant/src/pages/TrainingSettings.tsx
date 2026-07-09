import { useEffect, useState } from 'react';
import { GraduationCap, Trash2 } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { LoadingPage } from '../components/common/Spinner';
import { PageHeader } from '../components/common/PageHeader';
import { Alert } from '../components/common/Alert';
import { EmptyState } from '../components/common/EmptyState';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import botsService from '../services/bots.service';
import modulesService from '../services/modules.service';
import type { TenantBotSummary } from '../types/bot.types';

export const TrainingSettings = () => {
  const [bots, setBots] = useState<TenantBotSummary[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [facts, setFacts] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    botsService.getBots({ limit: 100 })
      .then((r) => {
        setBots(r.bots);
        if (r.bots.length > 0) setSelectedBotId(r.bots[0].bot_id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Error cargando bots'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedBotId) return;
    setLoading(true);
    modulesService.getCustomFacts(selectedBotId)
      .then(setFacts)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error cargando datos de entrenamiento'))
      .finally(() => setLoading(false));
  }, [selectedBotId]);

  const persist = async (updated: Record<string, string>) => {
    if (!selectedBotId) return;
    setSaving(true);
    setSaved(false);
    try {
      const result = await modulesService.updateCustomFacts(selectedBotId, updated);
      setFacts(result);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardando');
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) return;
    const updated = { ...facts, [newKey.trim()]: newValue.trim() };
    setNewKey('');
    setNewValue('');
    persist(updated);
  };

  const handleUpdateValue = (key: string, value: string) => {
    setFacts((prev) => ({ ...prev, [key]: value }));
  };

  const handleRemove = (key: string) => {
    const updated = { ...facts };
    delete updated[key];
    persist(updated);
  };

  if (loading && bots.length === 0) {
    return <LoadingPage />;
  }

  return (
    <AppLayout>
      <div className="font-editorial bg-white rounded-[1.4rem] shadow-[0_0.5rem_2rem_rgba(0,0,0,0.08)] p-6 sm:p-8">
        <PageHeader
          title="Entrenamiento"
          description="Editá datos puntuales que tu agente informa (ej. honorarios, horarios)"
          titleClassName="font-light uppercase tracking-[0.08em]"
          descriptionClassName="text-gray-800"
        />

        {error && <Alert variant="error" className="mb-6">{error}</Alert>}
        {saved && <Alert variant="success" className="mb-6">Guardado correctamente</Alert>}

        {bots.length === 0 ? (
          <Card shadow="none">
            <EmptyState
              icon={<GraduationCap className="w-8 h-8 text-gray-800" />}
              title="Todavía no tenés agentes configurados"
              description="Contactá a soporte para que configuren tu primer agente"
              titleClassName="text-gray-900 text-xl"
              descriptionClassName="text-gray-900 text-base"
            />
          </Card>
        ) : (
          <>
            {bots.length > 1 && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-900 mb-1">Agente</label>
                <select
                  value={selectedBotId || ''}
                  onChange={(e) => setSelectedBotId(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg bg-white"
                >
                  {bots.map((b) => (
                    <option key={b.bot_id} value={b.bot_id}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-3 mb-6">
              {Object.entries(facts).map(([key, value]) => (
                <Card key={key} shadow="none">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-xs font-medium text-gray-700 mb-1">{key}</p>
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => handleUpdateValue(key, e.target.value)}
                        onBlur={() => persist(facts)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <button
                      onClick={() => handleRemove(key)}
                      className="text-gray-400 hover:text-red-600 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </Card>
              ))}
              {Object.keys(facts).length === 0 && (
                <p className="text-gray-400 text-sm">Todavía no hay datos de entrenamiento configurados.</p>
              )}
            </div>

            <Card shadow="none">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Agregar dato</h3>
              <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="Clave (ej. honorarios)"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                />
                <input
                  type="text"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="Valor (ej. $500 USD por consulta inicial)"
                  className="flex-[2] px-3 py-2 border border-gray-300 rounded-lg"
                />
                <Button type="submit" variant="primary" loading={saving}>
                  Agregar
                </Button>
              </form>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default TrainingSettings;
