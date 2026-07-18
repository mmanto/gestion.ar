import { useEffect, useState } from 'react';
import { BrandingSection } from '../components/settings/BrandingSection';
import { GraduationCap, Trash2 } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { LoadingPage } from '../components/common/Spinner';
import { PageHeader } from '../components/common/PageHeader';
import { Alert } from '../components/common/Alert';
import { EmptyState } from '../components/common/EmptyState';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../hooks/useTenant';
import botsService from '../services/bots.service';
import modulesService, { type SemaforoColor } from '../services/modules.service';
import type { UserRole } from '../types/auth.types';
import type { TenantBotSummary } from '../types/bot.types';

const roleLabels: Record<UserRole, string> = {
  super_admin: 'Administración general',
  admin: 'Administrador',
  operativo: 'Operativo',
};

const SEMAFORO_OPTIONS: { color: SemaforoColor; label: string; dotClass: string }[] = [
  { color: 'verde', label: 'Verde', dotClass: 'bg-green-500' },
  { color: 'amarillo', label: 'Amarillo', dotClass: 'bg-yellow-500' },
  { color: 'rojo', label: 'Rojo', dotClass: 'bg-red-500' },
];

const TrainingSection = () => {
  const [bots, setBots] = useState<TenantBotSummary[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [facts, setFacts] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [autoQualifyColors, setAutoQualifyColors] = useState<SemaforoColor[]>([]);
  const [savingColors, setSavingColors] = useState(false);
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
    Promise.all([
      modulesService.getCustomFacts(selectedBotId),
      modulesService.getAutoQualifyColors(selectedBotId),
    ])
      .then(([customFacts, colors]) => {
        setFacts(customFacts);
        setAutoQualifyColors(colors);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Error cargando datos de entrenamiento'))
      .finally(() => setLoading(false));
  }, [selectedBotId]);

  const toggleAutoQualifyColor = async (color: SemaforoColor) => {
    if (!selectedBotId) return;
    const updated = autoQualifyColors.includes(color)
      ? autoQualifyColors.filter((c) => c !== color)
      : [...autoQualifyColors, color];
    setAutoQualifyColors(updated);
    setSavingColors(true);
    try {
      const result = await modulesService.updateAutoQualifyColors(selectedBotId, updated);
      setAutoQualifyColors(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardando');
      setAutoQualifyColors(autoQualifyColors); // revertir ante error
    } finally {
      setSavingColors(false);
    }
  };

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
    <>
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

          <Card shadow="none" className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Calificación automática (semáforo)</h3>
            <p className="text-sm text-gray-700 mb-3">
              Elegí para qué resultados el agente califica al cliente de forma automática al
              determinarlos en la conversación. Podés elegir uno, dos o los tres.
            </p>
            <div className="flex flex-wrap gap-4">
              {SEMAFORO_OPTIONS.map(({ color, label, dotClass }) => (
                <label key={color} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoQualifyColors.includes(color)}
                    onChange={() => toggleAutoQualifyColor(color)}
                    disabled={savingColors}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  <span className={`w-2.5 h-2.5 rounded-full ${dotClass}`} />
                  <span className="text-sm text-gray-900">{label}</span>
                </label>
              ))}
            </div>
          </Card>

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
    </>
  );
};

export const Settings = () => {
  const { user } = useAuth();
  const { tenant } = useTenant();

  return (
    <AppLayout>
      <div className="font-editorial p-1 md:bg-white md:rounded-[1.4rem] md:shadow-[0_0.5rem_2rem_rgba(0,0,0,0.08)] md:p-8">
        <PageHeader
          title="Ajustes"
          description="Información de tu cuenta"
          titleClassName="font-semibold uppercase tracking-[0.08em]"
          descriptionClassName="text-gray-800"
        />

        <Card shadow="none" className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Mi cuenta</h2>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-gray-700 mb-1">Usuario</p>
              <p className="text-sm text-gray-900">{user?.username}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-700 mb-1">Email</p>
              <p className="text-sm text-gray-900">{user?.email || '(No configurado)'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-700 mb-1">Rol</p>
              <p className="text-sm text-gray-900">{user ? roleLabels[user.role] : ''}</p>
            </div>
            {tenant && (
              <div>
                <p className="text-xs font-medium text-gray-700 mb-1">Tenant</p>
                <p className="text-sm text-gray-900">{tenant.name}</p>
              </div>
            )}
          </div>
        </Card>

        {user?.role === 'admin' && <BrandingSection />}

        {(user?.role === 'admin' || user?.role === 'operativo') && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Entrenamiento</h2>
            <TrainingSection />
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Settings;
