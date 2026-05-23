import { useState } from 'react';
import type {
  Channel,
  ChannelUpdate,
  ChannelStatus,
  WhatsAppConfig,
  TelegramConfig,
  WhatsAppProvider,
} from '../../types/channel.types';

interface ChannelEditFormProps {
  channel: Channel;
  onSave: (data: ChannelUpdate) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

const statusOptions: { value: ChannelStatus; label: string }[] = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
  { value: 'error', label: 'Error' },
];

const whatsappProviderLabels: Record<WhatsAppProvider, string> = {
  meta: 'Meta (Cloud API)',
  twilio: 'Twilio',
};

export const ChannelEditForm = ({ channel, onSave, onCancel, saving }: ChannelEditFormProps) => {
  const [formData, setFormData] = useState<{
    name: string;
    status: ChannelStatus;
    webhook_url: string;
    whatsapp_config?: WhatsAppConfig;
    telegram_config?: TelegramConfig;
  }>({
    name: channel.name,
    status: channel.status,
    webhook_url: channel.webhook_url || '',
    whatsapp_config: channel.whatsapp_config
      ? { ...channel.whatsapp_config }
      : undefined,
    telegram_config: channel.telegram_config
      ? { ...channel.telegram_config }
      : undefined,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido';
    }

    if (formData.webhook_url && !isValidUrl(formData.webhook_url)) {
      newErrors.webhook_url = 'URL invalida';
    }

    // Validaciones para WhatsApp
    if (channel.channel_type === 'whatsapp' && formData.whatsapp_config) {
      const provider = formData.whatsapp_config.provider;
      if (provider === 'meta') {
        if (!formData.whatsapp_config.meta_config?.phone_number_id) {
          newErrors.phone_number_id = 'Phone Number ID es requerido';
        }
        if (!formData.whatsapp_config.meta_config?.access_token) {
          newErrors.access_token = 'Access Token es requerido';
        }
      } else if (provider === 'twilio') {
        if (!formData.whatsapp_config.twilio_config?.account_sid) {
          newErrors.account_sid = 'Account SID es requerido';
        }
        if (!formData.whatsapp_config.twilio_config?.auth_token) {
          newErrors.auth_token = 'Auth Token es requerido';
        }
        if (!formData.whatsapp_config.twilio_config?.phone_number) {
          newErrors.phone_number = 'Numero de telefono es requerido';
        }
      }
    }

    // Validaciones para Telegram
    if (channel.channel_type === 'telegram' && formData.telegram_config) {
      if (!formData.telegram_config.bot_token) {
        newErrors.bot_token = 'Bot Token es requerido';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const isValidUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    const updateData: ChannelUpdate = {
      name: formData.name,
      status: formData.status,
      webhook_url: formData.webhook_url || undefined,
    };

    if (channel.channel_type === 'whatsapp' && formData.whatsapp_config) {
      updateData.whatsapp_config = formData.whatsapp_config;
    }

    if (channel.channel_type === 'telegram' && formData.telegram_config) {
      updateData.telegram_config = formData.telegram_config;
    }

    await onSave(updateData);
  };

  const updateMetaConfig = (key: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      whatsapp_config: {
        ...prev.whatsapp_config!,
        meta_config: {
          // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
          ...prev.whatsapp_config?.meta_config!,
          [key]: value,
        },
      },
    }));
  };

  const updateTwilioConfig = (key: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      whatsapp_config: {
        ...prev.whatsapp_config!,
        twilio_config: {
          // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
          ...prev.whatsapp_config?.twilio_config!,
          [key]: value,
        },
      },
    }));
  };

  const updateTelegramConfig = (key: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      telegram_config: {
        ...prev.telegram_config!,
        [key]: value,
      },
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Informacion Basica */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Informacion Basica</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                errors.name ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Estado
            </label>
            <select
              value={formData.status}
              onChange={(e) =>
                setFormData({ ...formData, status: e.target.value as ChannelStatus })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Webhook URL
            </label>
            <input
              type="url"
              value={formData.webhook_url}
              onChange={(e) => setFormData({ ...formData, webhook_url: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                errors.webhook_url ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="https://tu-dominio.com/webhook"
            />
            {errors.webhook_url && (
              <p className="mt-1 text-sm text-red-600">{errors.webhook_url}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              URL donde se enviaran las notificaciones del canal
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo de Canal
            </label>
            <input
              type="text"
              value={channel.channel_type === 'whatsapp' ? 'WhatsApp' : 'Telegram'}
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              El tipo de canal no puede ser modificado
            </p>
          </div>
        </div>
      </div>

      {/* Configuracion de WhatsApp */}
      {channel.channel_type === 'whatsapp' && formData.whatsapp_config && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Configuracion de WhatsApp
            {formData.whatsapp_config.provider && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({whatsappProviderLabels[formData.whatsapp_config.provider]})
              </span>
            )}
          </h2>

          {/* Meta Cloud API */}
          {formData.whatsapp_config.provider === 'meta' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number ID *
                </label>
                <input
                  type="text"
                  value={formData.whatsapp_config.meta_config?.phone_number_id || ''}
                  onChange={(e) => updateMetaConfig('phone_number_id', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                    errors.phone_number_id ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="ID del numero de WhatsApp Business"
                />
                {errors.phone_number_id && (
                  <p className="mt-1 text-sm text-red-600">{errors.phone_number_id}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Access Token *
                </label>
                <input
                  type="password"
                  value={formData.whatsapp_config.meta_config?.access_token || ''}
                  onChange={(e) => updateMetaConfig('access_token', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                    errors.access_token ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="Token de acceso de la API"
                />
                {errors.access_token && (
                  <p className="mt-1 text-sm text-red-600">{errors.access_token}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Verify Token
                </label>
                <input
                  type="text"
                  value={formData.whatsapp_config.meta_config?.verify_token || ''}
                  onChange={(e) => updateMetaConfig('verify_token', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Token para verificar webhook (opcional)"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API Version
                </label>
                <input
                  type="text"
                  value={formData.whatsapp_config.meta_config?.api_version || ''}
                  onChange={(e) => updateMetaConfig('api_version', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="v17.0 (opcional)"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Business Account ID
                </label>
                <input
                  type="text"
                  value={formData.whatsapp_config.meta_config?.business_account_id || ''}
                  onChange={(e) => updateMetaConfig('business_account_id', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="ID de cuenta de negocio (opcional)"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  App Secret
                </label>
                <input
                  type="password"
                  value={formData.whatsapp_config.meta_config?.app_secret || ''}
                  onChange={(e) => updateMetaConfig('app_secret', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Secret de la aplicacion (opcional)"
                />
              </div>
            </div>
          )}

          {/* Twilio */}
          {formData.whatsapp_config.provider === 'twilio' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account SID *
                </label>
                <input
                  type="text"
                  value={formData.whatsapp_config.twilio_config?.account_sid || ''}
                  onChange={(e) => updateTwilioConfig('account_sid', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                    errors.account_sid ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                />
                {errors.account_sid && (
                  <p className="mt-1 text-sm text-red-600">{errors.account_sid}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Auth Token *
                </label>
                <input
                  type="password"
                  value={formData.whatsapp_config.twilio_config?.auth_token || ''}
                  onChange={(e) => updateTwilioConfig('auth_token', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                    errors.auth_token ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="Tu Auth Token de Twilio"
                />
                {errors.auth_token && (
                  <p className="mt-1 text-sm text-red-600">{errors.auth_token}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Numero de Telefono *
                </label>
                <input
                  type="text"
                  value={formData.whatsapp_config.twilio_config?.phone_number || ''}
                  onChange={(e) => updateTwilioConfig('phone_number', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                    errors.phone_number ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="whatsapp:+14155238886"
                />
                {errors.phone_number && (
                  <p className="mt-1 text-sm text-red-600">{errors.phone_number}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  Formato: whatsapp:+1234567890
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Messaging Service SID
                </label>
                <input
                  type="text"
                  value={formData.whatsapp_config.twilio_config?.messaging_service_sid || ''}
                  onChange={(e) => updateTwilioConfig('messaging_service_sid', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (opcional)"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Configuracion de Telegram */}
      {channel.channel_type === 'telegram' && formData.telegram_config && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Configuracion de Telegram
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bot Token *
              </label>
              <input
                type="password"
                value={formData.telegram_config.bot_token || ''}
                onChange={(e) => updateTelegramConfig('bot_token', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                  errors.bot_token ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Token del bot de Telegram"
              />
              {errors.bot_token && (
                <p className="mt-1 text-sm text-red-600">{errors.bot_token}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bot Username
              </label>
              <input
                type="text"
                value={formData.telegram_config.bot_username || ''}
                onChange={(e) => updateTelegramConfig('bot_username', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="@mibot (opcional)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Webhook Secret
              </label>
              <input
                type="text"
                value={formData.telegram_config.webhook_secret || ''}
                onChange={(e) => updateTelegramConfig('webhook_secret', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Secret para validar webhooks (opcional)"
              />
            </div>
          </div>
        </div>
      )}

      {/* Botones de Accion */}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>
    </form>
  );
};

export default ChannelEditForm;
