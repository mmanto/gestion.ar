import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandingSection } from '../components/settings/BrandingSection';
import { BiometricSection } from '../components/settings/BiometricSection';
import { LayoutDashboard } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { PageHeader } from '../components/common/PageHeader';
import { Alert } from '../components/common/Alert';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { useAuth } from '../hooks/useAuth';
import { useAccentTheme } from '../hooks/useAccentTheme';
import botsService from '../services/bots.service';
import modulesService from '../services/modules.service';
import myChannelService, { type MyChannel } from '../services/myChannel.service';
import { publicService } from '../services/public.service';

export const Settings = () => {
  const { user } = useAuth();
  const { accent, accentSoft } = useAccentTheme();
  const navigate = useNavigate();

  // Los honorarios viven como custom fact del bot (ver modulesService) — se
  // guarda el mapa completo de facts (no solo "honorarios") porque el backend
  // reemplaza el objeto entero al actualizar, no lo mergea.
  const [botId, setBotId] = useState<string | null>(null);
  const [facts, setFacts] = useState<Record<string, string>>({});
  const [loadingHonorarios, setLoadingHonorarios] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [myChannel, setMyChannel] = useState<MyChannel | null>(null);
  const [loadingMyChannel, setLoadingMyChannel] = useState(true);
  const [publicUrl, setPublicUrl] = useState<string>(window.location.origin);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    botsService.getBots({ limit: 1 })
      .then((r) => {
        if (r.bots.length > 0) {
          setBotId(r.bots[0].bot_id);
        } else {
          setLoadingHonorarios(false);
          setLoadingMyChannel(false);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Error cargando datos');
        setLoadingHonorarios(false);
        setLoadingMyChannel(false);
      });
  }, []);

  useEffect(() => {
    if (!botId) return;
    modulesService.getCustomFacts(botId)
      .then(setFacts)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error cargando honorarios'))
      .finally(() => setLoadingHonorarios(false));
  }, [botId]);

  useEffect(() => {
    if (!botId) return;
    Promise.all([
      myChannelService.getMyChannel(botId),
      publicService.getPublicUrl(),
    ])
      .then(([channel, url]) => {
        setMyChannel(channel);
        setPublicUrl(url);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Error cargando el link de chat'))
      .finally(() => setLoadingMyChannel(false));
  }, [botId]);

  const handleCopyMyChannelLink = async () => {
    if (!myChannel) return;
    await navigator.clipboard.writeText(`${publicUrl}/chat/c/${myChannel.channel_id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
          actions={
            <Button variant="outline" onClick={() => navigate('/dashboard')}>
              <LayoutDashboard className="w-4 h-4 mr-1.5" />
              Ir al Escritorio
            </Button>
          }
        />

        {error && <Alert variant="error" className="mb-6">{error}</Alert>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start mb-6">
          <Card shadow="none" className={user?.role === 'admin' ? '' : 'md:col-span-2'}>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Mi cuenta</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div>
                <p className="text-xs font-medium text-gray-700 mb-1">Honorarios</p>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={facts.honorarios ?? ''}
                    onChange={(e) => handleHonorariosChange(e.target.value)}
                    onBlur={persistHonorarios}
                    disabled={loadingHonorarios || !botId}
                    placeholder="Ej. $500 por consulta inicial"
                    className="flex-1 px-3 py-2 rounded-lg border-2 outline-none transition-colors disabled:opacity-50"
                    style={{ borderColor: accent, backgroundColor: accentSoft }}
                  />
                  <p className="text-xs text-gray-500 whitespace-nowrap">Expresado en pesos mexicanos (MXN).</p>
                </div>
              </div>
            </div>
          </Card>

          {user?.role === 'admin' && <BrandingSection />}

          <BiometricSection />

          <Card shadow="none">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Mi link de chat</h2>
            {loadingMyChannel ? (
              <p className="text-sm text-gray-700">Cargando...</p>
            ) : !myChannel ? (
              <p className="text-sm text-gray-700">No hay un bot configurado todavía.</p>
            ) : (
              <div className="flex flex-col items-start gap-6">
                <img
                  src={publicService.getQrCodeUrl(myChannel.channel_id, publicUrl)}
                  alt="QR de tu chat"
                  className="w-32 h-32 rounded-lg border border-gray-200 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-700 mb-1">
                    Compartí este link o QR con tus clientes — quedan asignados a vos.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 min-w-0 text-xs bg-gray-100 p-2 rounded overflow-x-auto whitespace-nowrap">
                      {publicUrl}/chat/c/{myChannel.channel_id}
                    </code>
                    <Button variant="outline" onClick={handleCopyMyChannelLink}>
                      {copied ? '¡Copiado!' : 'Copiar'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </AppLayout>
  );
};

export default Settings;
