import { useEffect, useState } from 'react';
import { BrandingSection } from '../components/settings/BrandingSection';
import { BiometricSection } from '../components/settings/BiometricSection';
import { AppLayout } from '../components/layout/AppLayout';
import { PageHeader } from '../components/common/PageHeader';
import { Alert } from '../components/common/Alert';
import { Card } from '../components/common/Card';
import { useAuth } from '../hooks/useAuth';
import { useAccentTheme } from '../hooks/useAccentTheme';
import botsService from '../services/bots.service';
import modulesService from '../services/modules.service';

export const Settings = () => {
  const { user } = useAuth();
  const { accent, accentSoft } = useAccentTheme();

  // Los honorarios viven como custom fact del bot (ver modulesService) — se
  // guarda el mapa completo de facts (no solo "honorarios") porque el backend
  // reemplaza el objeto entero al actualizar, no lo mergea.
  const [botId, setBotId] = useState<string | null>(null);
  const [facts, setFacts] = useState<Record<string, string>>({});
  const [loadingHonorarios, setLoadingHonorarios] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    botsService.getBots({ limit: 1 })
      .then((r) => {
        if (r.bots.length > 0) {
          setBotId(r.bots[0].bot_id);
        } else {
          setLoadingHonorarios(false);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Error cargando datos');
        setLoadingHonorarios(false);
      });
  }, []);

  useEffect(() => {
    if (!botId) return;
    modulesService.getCustomFacts(botId)
      .then(setFacts)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error cargando honorarios'))
      .finally(() => setLoadingHonorarios(false));
  }, [botId]);

  const handleHonorariosChange = (value: string) => {
    setFacts((prev) => ({ ...prev, honorarios: value }));
  };

  const persistHonorarios = async () => {
    if (!botId) return;
    try {
      const result = await modulesService.updateCustomFacts(botId, facts);
      setFacts(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardando honorarios');
    }
  };

  const fullName = [user?.nombre, user?.apellido].filter(Boolean).join(' ') || user?.username || '';

  return (
    <AppLayout>
      <div className="font-editorial p-1 md:bg-[#F8F9FD] md:p-8">
        <PageHeader
          title="Ajustes"
          description="Información de tu cuenta"
          titleClassName="font-semibold uppercase tracking-[0.08em]"
          descriptionClassName="text-gray-800"
        />

        {error && <Alert variant="error" className="mb-6">{error}</Alert>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 items-start mb-6">
          <Card className="md:col-span-2" shadow="sm">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Mi cuenta</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              <div>
                <p className="text-xs font-medium text-gray-700 mb-1">Nombre completo</p>
                <p className="text-sm text-gray-900">{fullName || '(No configurado)'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-700 mb-1">DNI</p>
                <p className="text-sm text-gray-900">(No configurado)</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-700 mb-1">Correo</p>
                <p className="text-sm text-gray-900">{user?.email || '(No configurado)'}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs font-medium text-gray-700 mb-1">Honorarios</p>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <input
                    type="text"
                    value={facts.honorarios ?? ''}
                    onChange={(e) => handleHonorariosChange(e.target.value)}
                    onBlur={persistHonorarios}
                    disabled={loadingHonorarios || !botId}
                    placeholder="Ej. $500 por consulta inicial"
                    className="w-full sm:flex-1 px-3 py-2 rounded-lg border-2 outline-none transition-colors disabled:opacity-50"
                    style={{ borderColor: accent, backgroundColor: accentSoft }}
                  />
                  <p className="text-xs text-gray-500">Expresado en pesos mexicanos (MXN).</p>
                </div>
              </div>
            </div>
          </Card>

          {user?.role === 'admin' && <BrandingSection />}

          <BiometricSection />
        </div>
      </div>
    </AppLayout>
  );
};

export default Settings;