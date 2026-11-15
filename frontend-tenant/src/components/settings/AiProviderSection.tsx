import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Alert } from '../common/Alert';
import { PROVIDER_LABELS, PROVIDER_OPTIONS, useAiProviderSettings } from './useAiProviderSettings';
import type { LLMProvider } from '../../types/llm.types';

export const AiProviderSection = () => {
  const {
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
  } = useAiProviderSettings();

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
