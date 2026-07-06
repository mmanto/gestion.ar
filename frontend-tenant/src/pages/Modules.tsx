import { useEffect, useState, useCallback } from 'react';
import { Blocks } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { LoadingPage } from '../components/common/Spinner';
import { PageHeader } from '../components/common/PageHeader';
import { Alert } from '../components/common/Alert';
import { EmptyState } from '../components/common/EmptyState';
import { Card } from '../components/common/Card';
import botsService from '../services/bots.service';
import modulesService from '../services/modules.service';
import type { TenantBotSummary } from '../types/bot.types';
import type { BotModuleInfo } from '../types/tenant.types';

export const Modules = () => {
  const [bots, setBots] = useState<TenantBotSummary[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [modules, setModules] = useState<BotModuleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    botsService.getBots({ limit: 100 })
      .then((r) => {
        setBots(r.bots);
        if (r.bots.length > 0) setSelectedBotId(r.bots[0].bot_id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Error cargando bots'))
      .finally(() => setLoading(false));
  }, []);

  const loadModules = useCallback(async (botId: string) => {
    setLoading(true);
    try {
      const items = await modulesService.getBotModules(botId);
      setModules(items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando módulos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBotId) loadModules(selectedBotId);
  }, [selectedBotId, loadModules]);

  const handleToggle = async (moduleKey: string, enabled: boolean) => {
    if (!selectedBotId) return;
    setUpdating(moduleKey);
    try {
      await modulesService.setModuleEnabled(selectedBotId, moduleKey, enabled);
      await loadModules(selectedBotId);
    } catch (err) {
      console.error('Error toggling module:', err);
    } finally {
      setUpdating(null);
    }
  };

  if (loading && bots.length === 0) {
    return <LoadingPage />;
  }

  return (
    <AppLayout>
      <div className="font-editorial bg-white rounded-[1.4rem] shadow-[0_0.5rem_2rem_rgba(0,0,0,0.08)] p-6 sm:p-8">
        <PageHeader
          title="Módulos"
          description="Habilitá o deshabilitá las funcionalidades otorgadas a tu agente"
          titleClassName="font-light uppercase tracking-[0.08em]"
          descriptionClassName="text-gray-800"
        />

        {error && <Alert variant="error" className="mb-6">{error}</Alert>}

        {bots.length === 0 ? (
          <Card shadow="none">
            <EmptyState
              icon={<Blocks className="w-8 h-8 text-gray-600" />}
              title="Todavía no tenés agentes configurados"
              description="Contactá a soporte para que configuren tu primer agente"
              titleClassName="text-gray-900 text-xl"
              descriptionClassName="text-gray-700 text-base"
            />
          </Card>
        ) : (
          <>
            {bots.length > 1 && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Agente</label>
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

            <div className="space-y-3">
              {modules.map((mod) => (
                <Card key={mod.module_key} shadow="none">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{mod.module_name || mod.module_key}</p>
                      {mod.module_description && (
                        <p className="text-sm text-gray-500">{mod.module_description}</p>
                      )}
                      {!mod.granted && (
                        <p className="text-xs text-gray-400 mt-1">No otorgado — contactá a soporte para activarlo</p>
                      )}
                    </div>
                    <label className={`relative inline-flex items-center ${mod.granted ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}>
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={mod.enabled}
                        disabled={!mod.granted || updating === mod.module_key}
                        onChange={(e) => handleToggle(mod.module_key, e.target.checked)}
                      />
                      <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-green-600 transition-colors" />
                      <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
                    </label>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default Modules;
