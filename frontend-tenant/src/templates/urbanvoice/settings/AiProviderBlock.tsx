import {
  PROVIDER_LABELS,
  PROVIDER_OPTIONS,
  useAiProviderSettings,
} from '../../../components/settings/useAiProviderSettings';
import type { LLMProvider } from '../../../types/llm.types';

/** Proveedor de IA del tenant con la presentación del tema UrbanVoice. */
export default function AiProviderBlock() {
  const ai = useAiProviderSettings();

  return (
    <section className="card uv-set-card">
      <header className="uv-set-head">
        <div>
          <h3>Proveedor de IA</h3>
          <p>El modelo que responde en el asistente del tenant.</p>
        </div>
        <span className={`uv-set-status ${ai.configured ? 'ok' : 'warn'}`}>
          {ai.configured ? 'Configurado' : 'Sin configurar'}
        </span>
      </header>

      {ai.error ? <div className="uv-set-alert err">{ai.error}</div> : null}
      {ai.notice ? <div className="uv-set-alert ok">{ai.notice}</div> : null}

      {ai.loading ? (
        <p className="uv-set-hint">Cargando…</p>
      ) : (
        <>
          <div className="uv-set-3">
            <div className="uv-set-field">
              <label htmlFor="uv-ai-provider">Proveedor</label>
              <select
                id="uv-ai-provider"
                value={ai.provider}
                onChange={(event) => ai.handleProviderChange(event.target.value as LLMProvider)}
              >
                {PROVIDER_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="uv-set-field">
              <label htmlFor="uv-ai-model">Modelo</label>
              <input
                id="uv-ai-model"
                type="text"
                value={ai.model}
                onChange={(event) => ai.setModel(event.target.value)}
                placeholder={ai.placeholder}
                maxLength={200}
              />
            </div>

            <div className="uv-set-field">
              <label htmlFor="uv-ai-key">
                API key{ai.keyRequired ? '' : ' (opcional)'}
              </label>
              <input
                id="uv-ai-key"
                type="password"
                autoComplete="off"
                value={ai.apiKey}
                onChange={(event) => ai.setApiKey(event.target.value)}
                placeholder={ai.keyPlaceholder}
                maxLength={512}
              />
              <p className="uv-set-hint">
                {ai.providerChanged
                  ? 'Cambiaste de proveedor: hay que cargar su API key.'
                  : ai.configured
                    ? 'Dejala vacía para conservar la key guardada.'
                    : 'La key se valida contra el proveedor y se guarda cifrada.'}
              </p>
            </div>
          </div>

          {ai.configured ? (
            <p className="uv-set-hint">
              Configurado: {PROVIDER_LABELS[ai.config?.provider ?? ai.provider]} / {ai.config?.model}
            </p>
          ) : null}

          {ai.config?.last_error ? (
            <div className="uv-set-alert warn">
              Último error registrado: {ai.config.last_error}
            </div>
          ) : null}

          <div className="uv-set-actions">
            <button
              type="button"
              className="btn pri sm"
              onClick={ai.handleSave}
              disabled={!ai.canSave}
            >
              {ai.saving ? 'Guardando…' : 'Guardar'}
            </button>
            {ai.configured ? (
              <button
                type="button"
                className="btn sm"
                onClick={ai.handleValidate}
                disabled={ai.validating}
              >
                {ai.validating ? 'Probando…' : 'Probar conexión'}
              </button>
            ) : null}
            {ai.configured ? (
              <button
                type="button"
                className="btn sm danger"
                onClick={ai.handleRemove}
                disabled={ai.removing}
              >
                {ai.removing ? 'Quitando…' : 'Quitar configuración'}
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
