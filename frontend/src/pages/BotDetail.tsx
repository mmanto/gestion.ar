import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { LoadingPage } from '../components/common/Spinner';
import { BotEditForm } from '../components/bots/BotEditForm';
import botsService from '../services/bots.service';
import chatService from '../services/chat.service';
import type { Bot, BotStatus, BotUpdate } from '../types/bot.types';

const statusColors: Record<BotStatus, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-800',
  maintenance: 'bg-yellow-100 text-yellow-800',
};

const statusLabels: Record<BotStatus, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  maintenance: 'Mantenimiento',
};

export const BotDetail = () => {
  const { botId } = useParams<{ botId: string }>();
  const navigate = useNavigate();
  const [bot, setBot] = useState<Bot | null>(null);
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
        const data = await botsService.getBotById(botId);
        setBot(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error cargando bot');
      } finally {
        setLoading(false);
      }
    };

    fetchBot();
  }, [botId]);

  const handleDelete = async () => {
    if (!botId || !confirm('¿Estás seguro de que deseas eliminar este bot?')) {
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
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">Error: {error || 'Bot no encontrado'}</p>
              <Link
                to="/bots"
                className="text-indigo-600 hover:text-indigo-800 mt-2 inline-block"
              >
                Volver a Bots
              </Link>
            </div>
    </AppLayout>
    );
  }

  return (
    <AppLayout>
          {/* Breadcrumb */}
          <nav className="mb-4">
            <ol className="flex items-center space-x-2 text-sm text-gray-500">
              <li>
                <Link to="/bots" className="hover:text-indigo-600">
                  Bots
                </Link>
              </li>
              <li>/</li>
              <li className="text-gray-900">{bot.name}</li>
              {isEditing && (
                <>
                  <li>/</li>
                  <li className="text-indigo-600">Editar</li>
                </>
              )}
            </ol>
          </nav>

          {/* Error de guardado */}
          {saveError && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">{saveError}</p>
            </div>
          )}

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
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h1 className="text-3xl font-bold text-gray-900">{bot.name}</h1>
                      <span
                        className={`px-3 py-1 text-sm font-medium rounded-full ${
                          statusColors[bot.status]
                        }`}
                      >
                        {statusLabels[bot.status]}
                      </span>
                    </div>
                    {bot.description && (
                      <p className="text-gray-600 mb-2">{bot.description}</p>
                    )}
                    <span className="inline-block bg-gray-100 rounded px-3 py-1 text-sm">
                      {bot.business_type}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleGenerateQr}
                      disabled={qrLoading}
                      className="px-4 py-2 border border-indigo-300 text-indigo-600 rounded-lg hover:bg-indigo-50 disabled:opacity-50"
                    >
                      {qrLoading ? 'Generando...' : 'QR Code'}
                    </button>
                    <button
                      onClick={() => setIsEditing(true)}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                      Editar
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
                    >
                      {deleting ? 'Eliminando...' : 'Eliminar'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="bg-white rounded-lg shadow p-6">
                  <p className="text-sm text-gray-500 mb-1">Clientes</p>
                  <p className="text-3xl font-bold text-gray-900">{bot.total_clients}</p>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                  <p className="text-sm text-gray-500 mb-1">Conversaciones</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {bot.total_conversations}
                  </p>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                  <p className="text-sm text-gray-500 mb-1">Mensajes</p>
                  <p className="text-3xl font-bold text-gray-900">{bot.total_messages}</p>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <Link
                  to={`/bots/${bot.bot_id}/clients`}
                  className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
                >
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Ver Clientes
                  </h3>
                  <p className="text-gray-600">
                    Gestiona los {bot.total_clients} clientes de este bot
                  </p>
                </Link>

                <Link
                  to={`/bots/${bot.bot_id}/channels`}
                  className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
                >
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Ver Canales
                  </h3>
                  <p className="text-gray-600">
                    Configura los canales de comunicacion (WhatsApp, Telegram)
                  </p>
                </Link>

                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Configuracion
                  </h3>
                  <p className="text-gray-600 mb-4">Ajusta el comportamiento del bot</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">RAG habilitado:</span>
                      <span>{bot.config.use_rag ? 'Si' : 'No'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Max tokens:</span>
                      <span>{bot.config.max_tokens}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Temperatura:</span>
                      <span>{bot.config.temperature}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Configuracion Detallada */}
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">
                    Configuracion Detallada
                  </h2>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="text-indigo-600 hover:text-indigo-800 text-sm"
                  >
                    Editar configuracion
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">System Prompt</h3>
                    <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg whitespace-pre-wrap">
                      {bot.config.system_prompt || '(No configurado)'}
                    </p>
                  </div>

                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">
                      Mensaje de Bienvenida
                    </h3>
                    <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                      {bot.config.welcome_message || '(No configurado)'}
                    </p>
                  </div>

                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">
                      Mensaje de Fallback
                    </h3>
                    <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                      {bot.config.fallback_message || '(No configurado)'}
                    </p>
                  </div>

                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">Rate Limiting</h3>
                    <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg space-y-1">
                      <p>
                        <span className="text-gray-500">Mensajes:</span>{' '}
                        {bot.config.rate_limit_messages}
                      </p>
                      <p>
                        <span className="text-gray-500">Ventana:</span>{' '}
                        {bot.config.rate_limit_window} segundos
                      </p>
                    </div>
                  </div>

                  {bot.config.use_rag && (
                    <div>
                      <h3 className="font-medium text-gray-900 mb-2">
                        Configuracion RAG
                      </h3>
                      <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                        <p>
                          <span className="text-gray-500">Resultados:</span>{' '}
                          {bot.config.rag_results_count}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Metadata */}
              <div className="text-sm text-gray-500">
                <p>Creado: {new Date(bot.created_at).toLocaleDateString()}</p>
                <p>Actualizado: {new Date(bot.updated_at).toLocaleDateString()}</p>
              </div>
            </>
          )}

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
            <p className="text-sm text-gray-500 text-center mb-5">
              Escanea para iniciar una conversación
            </p>
            <img
              src={qrImageUrl}
              alt="QR Code"
              className="mx-auto w-56 h-56 object-contain rounded-lg"
            />
            <p className="text-xs text-gray-400 text-center mt-3 break-all">
              {window.location.origin}/chat/{botId}
            </p>
            <div className="flex gap-3 mt-6">
              <a
                href={qrImageUrl}
                download={`qr-${botId}.png`}
                className="flex-1 text-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
              >
                Descargar PNG
              </a>
              <button
                onClick={handleCloseQr}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

export default BotDetail;
