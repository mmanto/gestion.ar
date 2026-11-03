import { useEffect, useState } from 'react';
import axios from 'axios';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Alert } from '../common/Alert';
import llmConfigService from '../../services/llmConfig.service';
import type { LLMProvider, TenantLLMConfig } from '../../types/llm.types';

const PROVIDER_OPTIONS: { id: LLMProvider; label: string; placeholder: string }[] = [
  { id: 'claude', label: 'Claude (Anthropic)', placeholder: 'claude-haiku-4-5-20251001' },
  { id: 'deepseek', label: 'DeepSeek', placeholder: 'deepseek-v4-flash' },
  { id: 'openrouter', label: 'OpenRouter', placeholder: 'deepseek/deepseek-chat' },
];

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  claude: 'Claude (Anthropic)',
  deepseek: 'DeepSeek',
  openrouter: 'OpenRouter',
};

/** El backend devuelve `detail` como string (400/500 propios) o como lista de
 * errores de validación de Pydantic (422). */
function extractDetail(err: unknown, fallback: string): string {
  if (!axios.isAxiosError(err)) return fallback;
  const detail: unknown = err.response?.data?.detail;
  if (typeof detail === 'string' && detail) return detail;
  if (Array.isArray(detail)) {
    const first: unknown = detail[0];
    if (typeof first === 'object' && first !== null && 'msg' in first) {
      const { msg } = first;
      if (typeof msg === 'string' && msg) return msg;
    }
  }
  return fallback;
}

export const AiProviderSection = () => {
  const [config, setConfig] = useState<TenantLLMConfig | null>(null);
  const [provider, setProvider] = useState<LLMProvider>('claude');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const applyConfig = (cfg: TenantLLMConfig) => {
    setConfig(cfg);
    setProvider(cfg.provider ?? 'claude');
    setModel(cfg.model ?? '');
    // La key guardada no se devuelve nunca: se vuelve a pedir sólo si cambia.
    setApiKey('');
  };

  useEffect(() => {
    llmConfigService
      .get()
      .then(applyConfig)
      .catch((err) => setError(extractDetail(err, 'No se pudo cargar la configuración de IA')))
      .finally(() => setLoading(false));
  }, []);

  const configured = config?.configured === true;
  const providerChanged = configured && provider !== config?.provider;
  const keyRequired = !configured || providerChanged;
  const placeholder =
    PROVIDER_OPTIONS.find((opt) => opt.id === provider)?.placeholder ?? '';
  const keyPlaceholder = config?.api_key_hint ? `••••${config.api_key_hint}` : '';

  const handleProviderChange = (next: LLMProvider) => {
    setProvider(next);
    setApiKey('');
    setNotice(null);
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await llmConfigService.save(provider, model.trim(), apiKey.trim() || undefined);
      applyConfig(saved);
      setNotice('Configuración guardada y validada contra el proveedor');
    } catch (err) {
      setError(extractDetail(err, 'No se pudo guardar la configuración de IA'));
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    setError(null);
    setNotice(null);
    try {
      const result = await llmConfigService.validate();
      const fresh = await llmConfigService.get();
      applyConfig(fresh);
      if (result.valid) {
        setNotice('La conexión con el proveedor funciona');
      } else {
        setError(result.error || 'El proveedor rechazó la configuración guardada');
      }
    } catch (err) {
      setError(extractDetail(err, 'No se pudo probar la conexión'));
    } finally {
      setValidating(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm('¿Quitar la configuración? El asistente dejará de responder hasta que cargues otra.')) {
      return;
    }
    setRemoving(true);
    setError(null);
    setNotice(null);
    try {
      await llmConfigService.remove();
      applyConfig({
        configured: false,
        provider: null,
        model: null,
        api_key_hint: null,
        last_validated_at: null,
        last_error: null,
        updated_at: null,
        updated_by: null,
      });
      setNotice('Configuración eliminada — el asistente no responde');
    } catch (err) {
      setError(extractDetail(err, 'No se pudo quitar la configuración'));
    } finally {
      setRemoving(false);
    }
  };

  const canSave =
    !saving && model.trim().length >= 3 && (!keyRequired || apiKey.trim().length >= 8);

  return (
    <Card className="md:col-span-2" shadow="sm">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Proveedor de IA</h2>

      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}

      {notice && (
        <Alert variant="success" className="mb-4">
          {notice}
        </Alert>
      )}

      {configured ? (
        <p className="text-sm text-green-700 mb-4">
          Configurado — {PROVIDER_LABELS[config?.provider ?? provider]} / {config?.model}
        </p>
      ) : (
        <p className="text-sm text-amber-700 mb-4">
          Sin configurar — el asistente no responde
        </p>
      )}

      {loading ? (
        <p className="text-sm text-gray-700">Cargando...</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="llm-provider" className="block text-xs font-medium text-gray-700 mb-2">
              Proveedor
            </label>
            <select
              id="llm-provider"
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value as LLMProvider)}
              className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              {PROVIDER_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="llm-model" className="block text-xs font-medium text-gray-700 mb-2">
              Modelo
            </label>
            <input
              id="llm-model"
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={placeholder}
              maxLength={200}
              className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="llm-api-key" className="block text-xs font-medium text-gray-700 mb-2">
              API key{keyRequired ? '' : ' (opcional)'}
            </label>
            <input
              id="llm-api-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={keyPlaceholder}
              maxLength={512}
              className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-2">
              {providerChanged
                ? 'Cambiaste de proveedor: hay que cargar su API key.'
                : configured
                  ? 'Dejalo vacío para conservar la key guardada.'
                  : 'La key se valida contra el proveedor y se guarda cifrada.'}
            </p>
          </div>

          {config?.last_error && (
            <p className="text-xs text-red-700">
              Último error registrado: {config.last_error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={handleSave} disabled={!canSave} loading={saving}>
              Guardar
            </Button>
            {configured && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleValidate}
                loading={validating}
              >
                Probar conexión
              </Button>
            )}
            {configured && (
              <Button variant="danger" size="sm" onClick={handleRemove} loading={removing}>
                Quitar configuración
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};

export default AiProviderSection;
