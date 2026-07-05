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
import chatService from '../services/chat.service';
import { formatNumber } from '../utils/formatters';
import type { Bot, BotStats, BotStatus, BotUpdate } from '../types/bot.types';

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
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

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

  const handleGenerateQr = async () => {
    if (!botId) return;
    setQrLoading(true);
    try {
      const url = await chatService.getQrCodeUrl(botId, window.location.origin);
      if (qrImageUrl) URL.revokeObjectURL(qrImageUrl);
      setQrImageUrl(url);
      setShowQrModal(true);
    } catch (err) {
      console.error('Error generando QR:', err);
    } finally {
      setQrLoading(false);
    }
  };

  const handleCloseQr = () => {
    setShowQrModal(false);
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

  return (
    <AppLayout>
      <div className="font-editorial bg-white rounded-[1.4rem] shadow-[0_0.5rem_2rem_rgba(0,0,0,0.08)] p-6 sm:p-8">
          {/* Breadcrumb */}
          <nav className="mb-4">
            <ol className="flex items-center space-x-2 text-base text-gray-700">
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
                      <h1 className="text-3xl font-light uppercase tracking-[0.08em] text-gray-900">{bot.name}</h1>
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
                    <Button variant="outline" onClick={handleGenerateQr} disabled={qrLoading}>
                      {qrLoading ? 'Generando...' : 'QR Code'}
                    </Button>
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
                  <p className="text-base text-gray-700 mb-1">Clientes</p>
                  <p className="text-3xl font-normal text-gray-900">{bot.total_clients}</p>
                </Card>
                <Card shadow="none">
                  <p className="text-base text-gray-700 mb-1">Uso de tokens</p>
                  <p className="text-3xl font-normal text-gray-900">
                    {formatNumber(stats?.total_tokens_used ?? 0)}
                  </p>
                </Card>
                <Card shadow="none">
                  <p className="text-base text-gray-700 mb-1">Suscripción</p>
                  <p className="text-3xl font-normal text-gray-900">Plan Pro</p>
                </Card>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                <Link to={`/bots/${bot.bot_id}/clients`}>
                  <Card shadow="none">
                    <h3 className="text-lg font-normal text-gray-900 mb-2">
                      Clientes
                    </h3>
                    <p className="text-gray-800">
                      Gestiona los {bot.total_clients} clientes de este agente
                    </p>
                  </Card>
                </Link>

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

                <Link to={`/bots/${bot.bot_id}/appointments`}>
                  <Card shadow="none">
                    <h3 className="text-lg font-normal text-gray-900 mb-2">
                      Turnos
                    </h3>
                    <p className="text-gray-800">
                      Recursos, servicios, disponibilidad y turnos reservados
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
                        <span className="text-gray-700">RAG habilitado:</span>
                        <span className="text-gray-900">{bot.config.use_rag ? 'Si' : 'No'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-700">Max tokens:</span>
                        <span className="text-gray-900">{bot.config.max_tokens}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-700">Temperatura:</span>
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
                        <span className="text-gray-700">Mensajes:</span>{' '}
                        {bot.config.rate_limit_messages}
                      </p>
                      <p>
                        <span className="text-gray-700">Ventana:</span>{' '}
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
                          <span className="text-gray-700">Resultados:</span>{' '}
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

              {/* Metadata */}
              <div className="text-base text-gray-700">
                <p>Creado: {new Date(bot.created_at).toLocaleDateString()}</p>
                <p>Actualizado: {new Date(bot.updated_at).toLocaleDateString()}</p>
              </div>
            </>
          )}
      </div>

      {/* Modal QR Code */}
      {showQrModal && qrImageUrl && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={handleCloseQr}
        >
          <div
            className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-1 text-center">
              Chat QR — {bot?.name}
            </h3>
            <p className="text-sm text-gray-700 text-center mb-5">
              Escanea para iniciar una conversación
            </p>
            <img
              src={qrImageUrl}
              alt="QR Code"
              className="mx-auto w-56 h-56 object-contain rounded-lg"
            />
            <p className="text-xs text-gray-500 text-center mt-3 break-all">
              {window.location.origin}/chat/{botId}
            </p>
            <div className="flex gap-3 mt-6">
              <a href={qrImageUrl} download={`qr-${botId}.png`} className="flex-1">
                <Button variant="primary" fullWidth>Descargar PNG</Button>
              </a>
              <Button variant="outline" fullWidth onClick={handleCloseQr}>
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default BotDetail;
