import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { LoadingPage } from '../components/common/Spinner';
import { ChannelEditForm } from '../components/channels/ChannelEditForm';
import useChannels from '../hooks/useChannels';
import { useAuth } from '../hooks/useAuth';
import channelsService from '../services/channels.service';
import { publicService } from '../services/public.service';
import type { Channel, ChannelType, ChannelStatus, ChannelUpdate, WhatsAppConfig, TelegramConfig, WhatsAppProvider } from '../types/channel.types';

const channelTypeLabels: Record<ChannelType, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  web: 'Web (WebSocket)',
  pwa: 'PWA (Push Notifications)',
};

const whatsappProviderLabels: Record<WhatsAppProvider, string> = {
  meta: 'Meta (Cloud API)',
  twilio: 'Twilio',
};

const statusColors: Record<ChannelStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-800',
  error: 'bg-red-100 text-red-800',
};

const statusLabels: Record<ChannelStatus, string> = {
  pending: 'Pendiente',
  active: 'Activo',
  inactive: 'Inactivo',
  error: 'Error',
};

interface CreateChannelForm {
  channel_type: ChannelType;
  name: string;
  whatsapp_provider: WhatsAppProvider;
  whatsapp_config?: WhatsAppConfig;
  telegram_config?: TelegramConfig;
  webhook_url?: string;
}

export const BotChannels = () => {
  const { botId } = useParams<{ botId: string }>();
  const { channels, loading, error, refetch } = useChannels(botId || '');
  const { user } = useAuth();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [qrChannel, setQrChannel] = useState<Channel | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrBaseUrl, setQrBaseUrl] = useState(window.location.origin);

  useEffect(() => {
    publicService.getPublicUrl().then(setQrBaseUrl).catch(() => {});
  }, []);
  const [formData, setFormData] = useState<CreateChannelForm>({
    channel_type: 'whatsapp',
    name: '',
    whatsapp_provider: 'meta',
    webhook_url: '',
    whatsapp_config: {
      provider: 'meta',
      meta_config: {
        phone_number_id: '',
        access_token: '',
        verify_token: '',
      },
      twilio_config: {
        account_sid: '',
        auth_token: '',
        phone_number: '',
      },
    },
    telegram_config: {
      bot_token: '',
      bot_username: '',
      webhook_secret: '',
    },
  });

  const handleGenerateQr = async (channel: Channel, baseUrl?: string) => {
    if (!botId) return;
    const url = baseUrl ?? qrBaseUrl;
    try {
      setQrChannel(channel);
      setQrLoading(true);
      if (qrImageUrl) URL.revokeObjectURL(qrImageUrl);
      setQrImageUrl(null);
      const imgUrl = await channelsService.getChannelQrCode(botId, channel.channel_id, url);
      setQrImageUrl(imgUrl);
    } catch (err) {
      console.error('Error generating QR:', err);
    } finally {
      setQrLoading(false);
    }
  };

  const handleCloseQr = () => {
    if (qrImageUrl) URL.revokeObjectURL(qrImageUrl);
    setQrImageUrl(null);
    setQrChannel(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!botId) return;

    try {
      setCreating(true);

      // Preparar configuración según el tipo de canal
      let whatsappConfig: WhatsAppConfig | undefined;
      if (formData.channel_type === 'whatsapp') {
        whatsappConfig = {
          provider: formData.whatsapp_provider,
          ...(formData.whatsapp_provider === 'meta'
            ? { meta_config: formData.whatsapp_config?.meta_config }
            : { twilio_config: formData.whatsapp_config?.twilio_config }),
        };
      }

      const channelData = {
        channel_type: formData.channel_type,
        name: formData.name,
        webhook_url: formData.webhook_url || undefined,
        ...(formData.channel_type === 'whatsapp'
          ? { whatsapp_config: whatsappConfig }
          : formData.channel_type === 'telegram'
          ? { telegram_config: formData.telegram_config }
          : {}),
      };

      await channelsService.createChannel(botId, channelData);
      setShowCreateModal(false);
      setFormData({
        channel_type: 'whatsapp',
        name: '',
        whatsapp_provider: 'meta',
        webhook_url: '',
        whatsapp_config: {
          provider: 'meta',
          meta_config: { phone_number_id: '', access_token: '', verify_token: '' },
          twilio_config: { account_sid: '', auth_token: '', phone_number: '' },
        },
        telegram_config: { bot_token: '', bot_username: '', webhook_secret: '' },
      });
      refetch();
    } catch (err) {
      console.error('Error creating channel:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleActivate = async (channelId: string) => {
    if (!botId) return;
    try {
      await channelsService.activateChannel(botId, channelId);
      refetch();
    } catch (err) {
      console.error('Error activating channel:', err);
    }
  };

  const handleDeactivate = async (channelId: string) => {
    if (!botId) return;
    try {
      await channelsService.deactivateChannel(botId, channelId);
      refetch();
    } catch (err) {
      console.error('Error deactivating channel:', err);
    }
  };

  const handleUpdateWebhook = async (channelId: string, webhookUrl: string) => {
    if (!botId) return;
    try {
      await channelsService.updateChannel(botId, channelId, { webhook_url: webhookUrl });
      refetch();
    } catch (err) {
      console.error('Error updating webhook:', err);
    }
  };

  const handleDelete = async (channelId: string) => {
    if (!botId || !confirm('¿Estás seguro de que deseas eliminar este canal?')) return;
    try {
      await channelsService.deleteChannel(botId, channelId);
      refetch();
    } catch (err) {
      console.error('Error deleting channel:', err);
    }
  };

  const handleEdit = (channel: Channel) => {
    setEditingChannel(channel);
    setShowEditModal(true);
  };

  const handleSaveEdit = async (data: ChannelUpdate) => {
    if (!botId || !editingChannel) return;
    try {
      setSaving(true);
      await channelsService.updateChannel(botId, editingChannel.channel_id, data);
      setShowEditModal(false);
      setEditingChannel(null);
      refetch();
    } catch (err) {
      console.error('Error updating channel:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingPage />;
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
              <li>
                <Link to={`/bots/${botId}`} className="hover:text-indigo-600">
                  Bot
                </Link>
              </li>
              <li>/</li>
              <li className="text-gray-900">Canales</li>
            </ol>
          </nav>

          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Canales</h1>
              <p className="text-gray-600 mt-1">
                Gestiona los canales de comunicacion del bot
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Nuevo Canal
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {/* Channels List */}
          {channels.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <p className="text-gray-500 mb-4">No hay canales configurados</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="text-indigo-600 hover:text-indigo-800"
              >
                Crear el primer canal
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              {channels.map((channel: Channel) => (
                <ChannelCard
                  key={channel.channel_id}
                  channel={channel}
                  botId={botId || ''}
                  username={user?.username}
                  onActivate={handleActivate}
                  onDeactivate={handleDeactivate}
                  onDelete={handleDelete}
                  onEdit={handleEdit}
                  onUpdateWebhook={handleUpdateWebhook}
                  onGenerateQr={handleGenerateQr}
                />
              ))}
            </div>
          )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Nuevo Canal</h2>
            <form onSubmit={handleCreate}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de Canal
                  </label>
                  <select
                    value={formData.channel_type}
                    onChange={(e) =>
                      setFormData({ ...formData, channel_type: e.target.value as ChannelType })
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="telegram">Telegram</option>
                    <option value="web">Web (WebSocket + QR)</option>
                    <option value="pwa">PWA (Push Notifications + WebSocket)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="Nombre identificador del canal"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Webhook URL
                  </label>
                  <input
                    type="url"
                    value={formData.webhook_url || ''}
                    onChange={(e) => setFormData({ ...formData, webhook_url: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="https://tu-dominio.com/webhook (opcional)"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Dejar vacío para generar automáticamente. Esta es la URL que debes configurar en Twilio/Meta.
                  </p>
                </div>

                {formData.channel_type === 'whatsapp' && (
                  <>
                    {/* Selector de proveedor */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Proveedor
                      </label>
                      <select
                        value={formData.whatsapp_provider}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            whatsapp_provider: e.target.value as WhatsAppProvider,
                          })
                        }
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      >
                        <option value="meta">{whatsappProviderLabels.meta}</option>
                        <option value="twilio">{whatsappProviderLabels.twilio}</option>
                      </select>
                    </div>

                    {/* Campos para Meta Cloud API */}
                    {formData.whatsapp_provider === 'meta' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Phone Number ID
                          </label>
                          <input
                            type="text"
                            value={formData.whatsapp_config?.meta_config?.phone_number_id || ''}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                whatsapp_config: {
                                  ...formData.whatsapp_config!,
                                  meta_config: {
                                    // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
                                    ...formData.whatsapp_config?.meta_config!,
                                    phone_number_id: e.target.value,
                                  },
                                },
                              })
                            }
                            className="w-full border border-gray-300 rounded-lg px-3 py-2"
                            placeholder="ID del número de WhatsApp Business"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Access Token
                          </label>
                          <input
                            type="password"
                            value={formData.whatsapp_config?.meta_config?.access_token || ''}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                whatsapp_config: {
                                  ...formData.whatsapp_config!,
                                  meta_config: {
                                    // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
                                    ...formData.whatsapp_config?.meta_config!,
                                    access_token: e.target.value,
                                  },
                                },
                              })
                            }
                            className="w-full border border-gray-300 rounded-lg px-3 py-2"
                            placeholder="Token de acceso de la API"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Verify Token
                          </label>
                          <input
                            type="text"
                            value={formData.whatsapp_config?.meta_config?.verify_token || ''}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                whatsapp_config: {
                                  ...formData.whatsapp_config!,
                                  meta_config: {
                                    // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
                                    ...formData.whatsapp_config?.meta_config!,
                                    verify_token: e.target.value,
                                  },
                                },
                              })
                            }
                            className="w-full border border-gray-300 rounded-lg px-3 py-2"
                            placeholder="Token para verificar webhook (opcional)"
                          />
                        </div>
                      </>
                    )}

                    {/* Campos para Twilio */}
                    {formData.whatsapp_provider === 'twilio' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Account SID
                          </label>
                          <input
                            type="text"
                            value={formData.whatsapp_config?.twilio_config?.account_sid || ''}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                whatsapp_config: {
                                  ...formData.whatsapp_config!,
                                  twilio_config: {
                                    // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
                                    ...formData.whatsapp_config?.twilio_config!,
                                    account_sid: e.target.value,
                                  },
                                },
                              })
                            }
                            className="w-full border border-gray-300 rounded-lg px-3 py-2"
                            placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Auth Token
                          </label>
                          <input
                            type="password"
                            value={formData.whatsapp_config?.twilio_config?.auth_token || ''}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                whatsapp_config: {
                                  ...formData.whatsapp_config!,
                                  twilio_config: {
                                    // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
                                    ...formData.whatsapp_config?.twilio_config!,
                                    auth_token: e.target.value,
                                  },
                                },
                              })
                            }
                            className="w-full border border-gray-300 rounded-lg px-3 py-2"
                            placeholder="Tu Auth Token de Twilio"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Número de Teléfono
                          </label>
                          <input
                            type="text"
                            value={formData.whatsapp_config?.twilio_config?.phone_number || ''}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                whatsapp_config: {
                                  ...formData.whatsapp_config!,
                                  twilio_config: {
                                    // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
                                    ...formData.whatsapp_config?.twilio_config!,
                                    phone_number: e.target.value,
                                  },
                                },
                              })
                            }
                            className="w-full border border-gray-300 rounded-lg px-3 py-2"
                            placeholder="whatsapp:+14155238886"
                            required
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Formato: whatsapp:+1234567890
                          </p>
                        </div>
                      </>
                    )}
                  </>
                )}

                {formData.channel_type === 'web' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                    <p className="font-medium mb-1">Canal Web (WebSocket)</p>
                    <p>No requiere configuracion adicional. Una vez creado y activado, podras generar un codigo QR que los usuarios escanean para iniciar un chat en tiempo real.</p>
                    <p className="mt-2 text-xs text-blue-600">La URL de conexion WebSocket se genera automaticamente.</p>
                  </div>
                )}

                {formData.channel_type === 'pwa' && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 text-sm text-indigo-800">
                    <p className="font-medium mb-1">Canal PWA (Progressive Web App)</p>
                    <p>Convierte visitantes web en suscriptores permanentes via notificaciones push. No requiere WhatsApp ni Telegram.</p>
                    <ul className="mt-2 space-y-1 text-xs text-indigo-700 list-disc list-inside">
                      <li>Android Chrome: soporte completo</li>
                      <li>iOS 16.4+ Safari: requiere "Agregar a inicio"</li>
                      <li>Desktop Chrome/Edge: soporte completo</li>
                    </ul>
                    <p className="mt-2 text-xs text-indigo-600">Asegurate de configurar VAPID_PRIVATE_KEY y VAPID_PUBLIC_KEY en el servidor.</p>
                  </div>
                )}

                {formData.channel_type === 'telegram' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Bot Token
                      </label>
                      <input
                        type="password"
                        value={formData.telegram_config?.bot_token || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            telegram_config: {
                              ...formData.telegram_config!,
                              bot_token: e.target.value,
                            },
                          })
                        }
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Bot Username
                      </label>
                      <input
                        type="text"
                        value={formData.telegram_config?.bot_username || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            telegram_config: {
                              ...formData.telegram_config!,
                              bot_username: e.target.value,
                            },
                          })
                        }
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                        placeholder="@username (opcional)"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Webhook Secret
                      </label>
                      <input
                        type="text"
                        value={formData.telegram_config?.webhook_secret || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            telegram_config: {
                              ...formData.telegram_config!,
                              webhook_secret: e.target.value,
                            },
                          })
                        }
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {creating ? 'Creando...' : 'Crear Canal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Modal */}
      {qrChannel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold mb-1 text-center">QR - {qrChannel.name}</h2>
            <p className="text-sm text-gray-500 mb-4 text-center">Escanea para abrir el chat web</p>

            {/* URL base editable */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                URL base (ngrok, dominio, etc.)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={qrBaseUrl}
                  onChange={(e) => setQrBaseUrl(e.target.value)}
                  className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5"
                  placeholder="https://xxxx.ngrok.io"
                />
                <button
                  onClick={() => handleGenerateQr(qrChannel, qrBaseUrl)}
                  disabled={qrLoading}
                  className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {qrLoading ? '...' : 'Regenerar'}
                </button>
              </div>
            </div>

            {qrLoading && (
              <div className="h-48 flex items-center justify-center text-gray-400">
                Generando QR...
              </div>
            )}

            {qrImageUrl && (
              <div className="text-center">
                <img src={qrImageUrl} alt="QR Code" className="mx-auto mb-3 w-48 h-48" />
                <p className="text-xs text-gray-400 break-all mb-4">
                  {qrBaseUrl.replace(/\/$/, '')}/chat/c/{qrChannel.channel_id}
                </p>
                <a
                  href={qrImageUrl}
                  download={`qr-${qrChannel.channel_id}.png`}
                  className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm mr-2"
                >
                  Descargar PNG
                </a>
                {user?.username && (
                  <a
                    href={`${qrBaseUrl.replace(/\/$/, '')}/u/${user.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block px-4 py-2 border border-indigo-600 text-indigo-600 rounded-lg hover:bg-indigo-50 text-sm"
                  >
                    Ver página pública
                  </a>
                )}
              </div>
            )}

            <div className="mt-4 text-center">
              <button
                onClick={handleCloseQr}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingChannel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-50 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">Editar Canal</h2>
              <ChannelEditForm
                channel={editingChannel}
                onSave={handleSaveEdit}
                onCancel={() => {
                  setShowEditModal(false);
                  setEditingChannel(null);
                }}
                saving={saving}
              />
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
};

interface ChannelCardProps {
  channel: Channel;
  botId: string;
  username?: string;
  onActivate: (channelId: string) => void;
  onDeactivate: (channelId: string) => void;
  onDelete: (channelId: string) => void;
  onEdit: (channel: Channel) => void;
  onUpdateWebhook: (channelId: string, webhookUrl: string) => void;
  onGenerateQr: (channel: Channel) => void;
}

const ChannelCard = ({ channel, botId, username, onActivate, onDeactivate, onDelete, onEdit, onUpdateWebhook, onGenerateQr }: ChannelCardProps) => {
  const [isEditingWebhook, setIsEditingWebhook] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState(channel.webhook_url || '');

  const handleSaveWebhook = () => {
    onUpdateWebhook(channel.channel_id, webhookUrl);
    setIsEditingWebhook(false);
  };

  const isWebChannel = channel.channel_type === 'web';
  const isPwaChannel = channel.channel_type === 'pwa';

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
            {channel.channel_type === 'whatsapp' ? (
              <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            ) : channel.channel_type === 'telegram' ? (
              <svg className="w-6 h-6 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
            ) : (
              <svg className="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            )}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{channel.name}</h3>
            <p className="text-sm text-gray-500">
              {channelTypeLabels[channel.channel_type]}
              {channel.channel_type === 'whatsapp' && channel.whatsapp_config?.provider && (
                <span className="ml-1">
                  ({whatsappProviderLabels[channel.whatsapp_config.provider as WhatsAppProvider] || channel.whatsapp_config.provider})
                </span>
              )}
            </p>
          </div>
        </div>
        <span className={`px-3 py-1 text-sm font-medium rounded-full ${statusColors[channel.status]}`}>
          {statusLabels[channel.status]}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-500">Mensajes Recibidos:</span>
          <span className="ml-2 font-medium">{channel.total_messages_received}</span>
        </div>
        <div>
          <span className="text-gray-500">Mensajes Enviados:</span>
          <span className="ml-2 font-medium">{channel.total_messages_sent}</span>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-gray-500">
            {isWebChannel || isPwaChannel ? 'WebSocket URL:' : 'Webhook URL:'}
          </span>
          {!isWebChannel && !isPwaChannel && (
            <button
              onClick={() => setIsEditingWebhook(!isEditingWebhook)}
              className="text-xs text-indigo-600 hover:text-indigo-800"
            >
              {isEditingWebhook ? 'Cancelar' : 'Editar'}
            </button>
          )}
        </div>
        {!isWebChannel && !isPwaChannel && isEditingWebhook ? (
          <div className="flex gap-2">
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="flex-1 text-xs border border-gray-300 rounded px-2 py-1"
              placeholder="https://tu-dominio.com/webhook"
            />
            <button
              onClick={handleSaveWebhook}
              className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              Guardar
            </button>
          </div>
        ) : (
          <code className="block text-xs bg-gray-100 p-2 rounded overflow-x-auto">
            {channel.webhook_url || 'No configurado'}
          </code>
        )}
      </div>

      {(isWebChannel || isPwaChannel) && channel.status === 'active' && (
        <div className={`mt-3 border rounded-lg p-3 text-xs ${isPwaChannel ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 'bg-indigo-50 border-indigo-100 text-indigo-700'}`}>
          Chat URL:{' '}
          <a
            href={`/chat/c/${channel.channel_id}`}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            {window.location.origin}/chat/c/{channel.channel_id}
          </a>
        </div>
      )}

      <div className="mt-4 flex gap-2 flex-wrap">
        <button
          onClick={() => onEdit(channel)}
          className="px-3 py-1 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          Editar
        </button>
        {(isWebChannel || isPwaChannel) && channel.status === 'active' && (
          <button
            onClick={() => onGenerateQr(channel)}
            className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700"
          >
            Ver QR
          </button>
        )}
        {(isWebChannel || isPwaChannel) && channel.status === 'active' && username && (
          <a
            href={`/u/${username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1 text-sm border border-indigo-400 text-indigo-600 rounded hover:bg-indigo-50"
          >
            Ver página pública
          </a>
        )}
        {isPwaChannel && channel.status === 'active' && (
          <Link
            to={`/bots/${botId}/pwa/${channel.channel_id}`}
            className="px-3 py-1 text-sm bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200"
          >
            Suscriptores
          </Link>
        )}
        {channel.status === 'active' ? (
          <button
            onClick={() => onDeactivate(channel.channel_id)}
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            Desactivar
          </button>
        ) : (
          <button
            onClick={() => onActivate(channel.channel_id)}
            className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
          >
            Activar
          </button>
        )}
        <button
          onClick={() => onDelete(channel.channel_id)}
          className="px-3 py-1 text-sm border border-red-300 text-red-600 rounded hover:bg-red-50"
        >
          Eliminar
        </button>
      </div>

      <div className="mt-4 text-xs text-gray-400">
        Creado: {new Date(channel.created_at).toLocaleDateString()}
        {channel.last_activity_at && (
          <span className="ml-4">
            Ultima actividad: {new Date(channel.last_activity_at).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
};

export default BotChannels;
