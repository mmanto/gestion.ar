import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { LoadingPage } from '../components/common/Spinner';
import { Alert } from '../components/common/Alert';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { useAccentTheme } from '../hooks/useAccentTheme';
import { BotEditForm } from '../components/bots/BotEditForm';
import botsService from '../services/bots.service';
import tenantAdminService from '../services/tenantAdmin.service';
import { ModuleCard, type ModuleConfigLink } from '../components/bots/ModuleCard';
import { formatNumber } from '../utils/formatters';
import type { Bot, BotStats, BotStatus, BotUpdate } from '../types/bot.types';
import type { BotModuleInfo } from '../types/tenant.types';

const statusColors: Record<BotStatus, string> = {
  active: 'bg-green-200 text-green-950',
  inactive: 'bg-gray-200 text-gray-950',
  maintenance: 'bg-yellow-200 text-yellow-950',
};

const statusLabels: Record<BotStatus, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  maintenance: 'Mantenimiento',
};

export const BotDetail = () => {
  const { accent } = useAccentTheme();
  const { botId } = useParams<{ botId: string }>();
  const navigate = useNavigate();
  const [bot, setBot] = useState<Bot | null>(null);
  const [stats, setStats] = useState<BotStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [modules, setModules] = useState<BotModuleInfo[]>([]);
  const [modulesUpdating, setModulesUpdating] = useState<string | null>(null);

  const loadModules = async () => {
    if (!botId) return;
    try {
      setModules(await tenantAdminService.getBotModules(botId));
    } catch (err) {
      console.error('Error cargando módulos:', err);
    }
  };

  useEffect(() => {
    loadModules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId]);

  const handleToggleGrant = async (moduleKey: string, granted: boolean) => {
    if (!botId) return;
    setModulesUpdating(moduleKey);
    try {
      if (granted) {
        await tenantAdminService.revokeModule(botId, moduleKey);
      } else {
        await tenantAdminService.grantModule(botId, moduleKey);
      }
      await loadModules();
    } catch (err) {
      console.error('Error actualizando módulo:', err);
    } finally {
      setModulesUpdating(null);
    }
  };

  useEffect(() => {
    const fetchBot = async () => {
      if (!botId) return;

      try {
        setLoading(true);
        const [data, statsData] = await Promise.all([
          botsService.getBotById(botId),
          botsService.getBotStats(botId),
        ]);
        setBot(data);
        setStats(statsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error cargando agente');
      } finally {
        setLoading(false);
      }
    };

    fetchBot();
  }, [botId]);

  const handleDelete = async () => {
    if (!botId || !confirm('¿Estás seguro de que deseas eliminar este agente?')) {
      return;
    }

    try {
      setDeleting(true);
      await botsService.deleteBot(botId);
      navigate('/bots');
    } catch (err) {
      console.error('Error deleting bot:', err);
      setDeleting(false);
    }
  };

  const handleSave = async (updateData: BotUpdate) => {
    if (!botId) return;

    try {
      setSaving(true);
      setSaveError(null);
      const updatedBot = await botsService.updateBot(botId, updateData);
      setBot(updatedBot);
      setIsEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error guardando cambios');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setSaveError(null);
  };

  if (loading) {
    return <LoadingPage />;
  }

  if (error || !bot) {
    return (
      <AppLayout>
        <div className="font-editorial bg-white rounded-[1.4rem] shadow-[0_0.5rem_2rem_rgba(0,0,0,0.08)] p-6 sm:p-8">
          <Alert variant="error">
            <p>Error: {error || 'Agente no encontrado'}</p>
            <Link to="/bots" className="mt-2 inline-block hover:underline" style={{ color: accent }}>
              Volver a Agentes
            </Link>
          </Alert>
        </div>
      </AppLayout>
    );
  }

  const moduleConfigLinks: Record<string, ModuleConfigLink> = {
    appointments: { path: `/bots/${bot.bot_id}/appointments`, label: 'Configurar' },
    lead_funnel: { label: 'Configurar', onClick: () => setIsEditing(true) },
  };

  return (
    <AppLayout>
      <div className="font-editorial bg-white rounded-[1.4rem] shadow-[0_0.5rem_2rem_rgba(0,0,0,0.08)] p-6 sm:p-8">
          {/* Breadcrumb */}
          <nav className="mb-4">
            <ol className="flex items-center space-x-2 text-base text-gray-900">
              <li>
                <Link to="/bots" className="hover:underline" style={{ color: accent }}>
                  Agentes
                </Link>
              </li>
              <li>/</li>
              <li className="text-gray-900">{bot.name}</li>
              {isEditing && (
                <>
                  <li>/</li>
                  <li style={{ color: accent }}>Editar</li>
                </>
              )}
            </ol>
          </nav>

          {/* Error de guardado */}
          {saveError && <Alert variant="error" className="mb-4">{saveError}</Alert>}

          {isEditing ? (
            /* Modo Edicion */
            <BotEditForm
              bot={bot}
              onSave={handleSave}
              onCancel={handleCancelEdit}
              saving={saving}
            />
          ) : (
            /* Modo Vista */
            <>
              {/* Header */}
              <Card className="mb-6" shadow="none">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h1 className="text-3xl font-semibold uppercase tracking-[0.08em] text-gray-900">{bot.name}</h1>
                      <span
                        className={`px-3 py-1 text-base font-medium rounded-full ${
                          statusColors[bot.status]
                        }`}
                      >
                        {statusLabels[bot.status]}
                      </span>
                    </div>
                    {bot.description && (
                      <p className="text-gray-800 mb-2">{bot.description}</p>
                    )}
                    <span className="inline-block bg-gray-200 rounded-full px-3 py-1 text-base">
                      {bot.business_type}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="primary" onClick={() => setIsEditing(true)}>
                      Editar
                    </Button>
                    <Button variant="danger" onClick={handleDelete} disabled={deleting}>
                      {deleting ? 'Eliminando...' : 'Eliminar'}
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <Card shadow="none">
                  <p className="text-base text-gray-900 mb-1">Clientes</p>
                  <p className="text-3xl font-normal text-gray-900">{bot.total_clients}</p>
                </Card>
                <Card shadow="none">
                  <p className="text-base text-gray-900 mb-1">Uso de tokens</p>
                  <p className="text-3xl font-normal text-gray-900">
                    {formatNumber(stats?.total_tokens_used ?? 0)}
                  </p>
                </Card>
                <Card shadow="none">
                  <p className="text-base text-gray-900 mb-1">Suscripción</p>
                  <p className="text-3xl font-normal text-gray-900">Plan Pro</p>
                </Card>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <Link to={`/bots/${bot.bot_id}/channels`}>
                  <Card shadow="none">
                    <h3 className="text-lg font-normal text-gray-900 mb-2">
                      Canales
                    </h3>
                    <p className="text-gray-800">
                      Configura los canales de comunicacion (WhatsApp, Telegram)
                    </p>
                  </Card>
                </Link>
              </div>

              {/* Configuración Detallada */}
              <Card className="mb-6" shadow="none">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-normal text-gray-900">
                    Configuración Detallada
                  </h2>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="text-base hover:underline"
                    style={{ color: accent }}
                  >
                    Editar configuración
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">Parámetros del Modelo</h3>
                    <div className="text-base text-gray-800 bg-gray-100 p-3 rounded-lg space-y-1">
                      <div className="flex justify-between">
                        <span className="text-gray-900">RAG habilitado:</span>
                        <span className="text-gray-900">{bot.config.use_rag ? 'Si' : 'No'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-900">Max tokens:</span>
                        <span className="text-gray-900">{bot.config.max_tokens}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-900">Temperatura:</span>
                        <span className="text-gray-900">{bot.config.temperature}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">System Prompt</h3>
                    <p className="text-base text-gray-800 bg-gray-100 p-3 rounded-lg whitespace-pre-wrap">
                      {bot.config.system_prompt || '(No configurado)'}
                    </p>
                  </div>

                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">
                      Mensaje de Bienvenida
                    </h3>
                    <p className="text-base text-gray-800 bg-gray-100 p-3 rounded-lg">
                      {bot.config.welcome_message || '(No configurado)'}
                    </p>
                  </div>

                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">
                      Mensaje de Fallback
                    </h3>
                    <p className="text-base text-gray-800 bg-gray-100 p-3 rounded-lg">
                      {bot.config.fallback_message || '(No configurado)'}
                    </p>
                  </div>

                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">Rate Limiting</h3>
                    <div className="text-base text-gray-800 bg-gray-100 p-3 rounded-lg space-y-1">
                      <p>
                        <span className="text-gray-900">Mensajes:</span>{' '}
                        {bot.config.rate_limit_messages}
                      </p>
                      <p>
                        <span className="text-gray-900">Ventana:</span>{' '}
                        {bot.config.rate_limit_window} segundos
                      </p>
                    </div>
                  </div>

                  {bot.config.use_rag && (
                    <div>
                      <h3 className="font-medium text-gray-900 mb-2">
                        Configuración RAG
                      </h3>
                      <div className="text-base text-gray-800 bg-gray-100 p-3 rounded-lg">
                        <p>
                          <span className="text-gray-900">Resultados:</span>{' '}
                          {bot.config.rag_results_count}
                        </p>
                      </div>
                    </div>
                  )}

                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">Documentos</h3>
                    <Link
                      to={`/bots/${bot.bot_id}/documents`}
                      className="block text-base text-gray-800 bg-gray-100 p-3 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      Base de conocimiento (RAG) exclusiva de este agente
                    </Link>
                  </div>
                </div>
              </Card>

              {/* Módulos */}
              <Card className="mb-6" shadow="none">
                <h2 className="text-xl font-normal text-gray-900 mb-1">Módulos</h2>
                <p className="text-gray-900 mb-4">
                  Otorgá los módulos que este agente puede usar. El tenant sólo podrá
                  habilitar/deshabilitar los módulos ya otorgados acá.
                </p>
                <div className="space-y-3">
                  {modules.map((m) => (
                    <ModuleCard
                      key={m.module_key}
                      module={m}
                      onToggleGrant={handleToggleGrant}
                      updating={modulesUpdating === m.module_key}
                      configLink={moduleConfigLinks[m.module_key]}
                    />
                  ))}
                </div>
              </Card>

              {/* Metadata */}
              <div className="text-base text-gray-900">
                <p>Creado: {new Date(bot.created_at).toLocaleDateString()}</p>
                <p>Actualizado: {new Date(bot.updated_at).toLocaleDateString()}</p>
              </div>
            </>
          )}
      </div>
    </AppLayout>
  );
};

export default BotDetail;
