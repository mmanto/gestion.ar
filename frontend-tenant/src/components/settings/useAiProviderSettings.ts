import { useEffect, useState } from 'react';
import axios from 'axios';
import llmConfigService from '../../services/llmConfig.service';
import type { LLMProvider, TenantLLMConfig } from '../../types/llm.types';

export const PROVIDER_OPTIONS: { id: LLMProvider; label: string; placeholder: string }[] = [
  { id: 'claude', label: 'Claude (Anthropic)', placeholder: 'claude-haiku-4-5-20251001' },
  { id: 'deepseek', label: 'DeepSeek', placeholder: 'deepseek-v4-flash' },
  { id: 'openrouter', label: 'OpenRouter', placeholder: 'deepseek/deepseek-chat' },
];

export const PROVIDER_LABELS: Record<LLMProvider, string> = {
  claude: 'Claude (Anthropic)',
  deepseek: 'DeepSeek',
  openrouter: 'OpenRouter',
};

/** El backend devuelve `detail` como string (400/500 propios) o como lista de
 * errores de validación de Pydantic (422). */
export function extractDetail(err: unknown, fallback: string): string {
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

/**
 * Estado y acciones de Ajustes › Proveedor de IA. La presentación del tema
 * UrbanVoice y la del backoffice clásico comparten este hook.
 */
export function useAiProviderSettings() {
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
  const placeholder = PROVIDER_OPTIONS.find((opt) => opt.id === provider)?.placeholder ?? '';
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

  return {
    config,
    provider,
    model,
    apiKey,
    loading,
    saving,
    validating,
    removing,
    error,
    notice,
    configured,
    providerChanged,
    keyRequired,
    placeholder,
    keyPlaceholder,
    canSave,
    setModel,
    setApiKey,
    handleProviderChange,
    handleSave,
    handleValidate,
    handleRemove,
  };
}
