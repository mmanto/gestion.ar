import { useState, useRef, useEffect } from 'react';
import type { Bot, BotUpdate, BotStatus, BotConfig, FlowStep, FlowConfig } from '../../types/bot.types';

interface BotEditFormProps {
  bot: Bot;
  onSave: (data: BotUpdate) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

const statusOptions: { value: BotStatus; label: string }[] = [
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
  { value: 'maintenance', label: 'Mantenimiento' },
];

export const BotEditForm = ({ bot, onSave, onCancel, saving }: BotEditFormProps) => {
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    business_type: string;
    status: BotStatus;
    config: BotConfig;
  }>({
    name: bot.name,
    description: bot.description || '',
    business_type: bot.business_type,
    status: bot.status,
    config: { ...bot.config },
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [iusError, setIusError] = useState<string | null>(null);
  const [iusJustLoaded, setIusJustLoaded] = useState(false);
  const [isJsonPrompt, setIsJsonPrompt] = useState(() => {
    try { const p = JSON.parse(bot.config.system_prompt); return typeof p === 'object' && p !== null; } catch { return false; }
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const parsed = JSON.parse(formData.config.system_prompt);
      setIsJsonPrompt(typeof parsed === 'object' && parsed !== null);
    } catch {
      setIsJsonPrompt(false);
    }
  }, [formData.config.system_prompt]);

  const iusMeta = formData.config.ius_config?.agent_identity as
    | { nombre?: string; rol?: string }
    | undefined;

  const handleIusFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          setIusError('El archivo no contiene un objeto JSON válido.');
          return;
        }
        setIusError(null);
        setIusJustLoaded(true);
        updateConfig('ius_config', parsed);
      } catch {
        setIusError('Error al parsear el archivo. Asegurate de que sea un JSON válido.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const removeIusConfig = () => {
    updateConfig('ius_config', null);
    setIusError(null);
    setIusJustLoaded(false);
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido';
    }

    if (!formData.business_type.trim()) {
      newErrors.business_type = 'El tipo de negocio es requerido';
    }

    if (formData.config.max_tokens < 1 || formData.config.max_tokens > 4096) {
      newErrors.max_tokens = 'Max tokens debe estar entre 1 y 4096';
    }

    if (formData.config.temperature < 0 || formData.config.temperature > 2) {
      newErrors.temperature = 'Temperatura debe estar entre 0 y 2';
    }

    if (formData.config.rag_results_count < 1 || formData.config.rag_results_count > 20) {
      newErrors.rag_results_count = 'Resultados RAG debe estar entre 1 y 20';
    }

    if (formData.config.rate_limit_messages < 1) {
      newErrors.rate_limit_messages = 'Limite de mensajes debe ser al menos 1';
    }

    if (formData.config.rate_limit_window < 1) {
      newErrors.rate_limit_window = 'Ventana de rate limit debe ser al menos 1 segundo';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setIusJustLoaded(false);

    const updateData: BotUpdate = {
      name: formData.name,
      description: formData.description || undefined,
      business_type: formData.business_type,
      status: formData.status,
      config: formData.config,
    };

    await onSave(updateData);
  };

  const updateConfig = <K extends keyof BotConfig>(key: K, value: BotConfig[K]) => {
    setFormData((prev) => ({
      ...prev,
      config: { ...prev.config, [key]: value },
    }));
  };

  const getOrInitFlow = (): FlowConfig => formData.config.flow ?? {
    enabled: false,
    steps: [],
    completion_message: '',
    skip_if_known: true,
  };

  const updateFlow = (update: Partial<FlowConfig>) => {
    updateConfig('flow', { ...getOrInitFlow(), ...update });
  };

  const addFlowStep = () => {
    const flow = getOrInitFlow();
    const newStep: FlowStep = { field: 'name', question: '', field_type: 'text', required: true };
    updateConfig('flow', { ...flow, steps: [...flow.steps, newStep] });
  };

  const removeFlowStep = (index: number) => {
    const flow = getOrInitFlow();
    updateConfig('flow', { ...flow, steps: flow.steps.filter((_, i) => i !== index) });
  };

  const updateFlowStep = (index: number, update: Partial<FlowStep>) => {
    const flow = getOrInitFlow();
    updateConfig('flow', {
      ...flow,
      steps: flow.steps.map((step, i) => (i === index ? { ...step, ...update } : step)),
    });
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
              Tipo de Negocio *
            </label>
            <input
              type="text"
              value={formData.business_type}
              onChange={(e) =>
                setFormData({ ...formData, business_type: e.target.value })
              }
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                errors.business_type ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            {errors.business_type && (
              <p className="mt-1 text-sm text-red-600">{errors.business_type}</p>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descripcion
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Estado
            </label>
            <select
              value={formData.status}
              onChange={(e) =>
                setFormData({ ...formData, status: e.target.value as BotStatus })
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
        </div>
      </div>

      {/* Configuracion de Mensajes */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Configuracion de Mensajes
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              System Prompt
            </label>
            <textarea
              value={formData.config.system_prompt}
              onChange={(e) => updateConfig('system_prompt', e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
              placeholder="Instrucciones del sistema para el bot... (también podés pegar JSON)"
            />
            {isJsonPrompt && (
              <p className="mt-1 text-xs text-green-600 font-medium">✓ JSON detectado — se convertirá a texto antes de enviarlo al modelo</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mensaje de Bienvenida
            </label>
            <textarea
              value={formData.config.welcome_message}
              onChange={(e) => updateConfig('welcome_message', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Mensaje que se envia al iniciar una conversacion..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mensaje de Fallback
            </label>
            <textarea
              value={formData.config.fallback_message}
              onChange={(e) => updateConfig('fallback_message', e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Mensaje cuando el bot no puede responder..."
            />
          </div>
        </div>
      </div>

      {/* Configuracion del Modelo */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Configuracion del Modelo
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Tokens (1-4096)
            </label>
            <input
              type="number"
              value={formData.config.max_tokens}
              onChange={(e) => updateConfig('max_tokens', parseInt(e.target.value) || 0)}
              min={1}
              max={4096}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                errors.max_tokens ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            {errors.max_tokens && (
              <p className="mt-1 text-sm text-red-600">{errors.max_tokens}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Temperatura (0-2)
            </label>
            <input
              type="number"
              value={formData.config.temperature}
              onChange={(e) =>
                updateConfig('temperature', parseFloat(e.target.value) || 0)
              }
              min={0}
              max={2}
              step={0.1}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                errors.temperature ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            {errors.temperature && (
              <p className="mt-1 text-sm text-red-600">{errors.temperature}</p>
            )}
          </div>
        </div>
      </div>

      {/* Configuracion RAG */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Configuracion RAG</h2>

        <div className="space-y-4">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="use_rag"
              checked={formData.config.use_rag}
              onChange={(e) => updateConfig('use_rag', e.target.checked)}
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            />
            <label htmlFor="use_rag" className="ml-2 text-sm text-gray-700">
              Habilitar RAG (Retrieval Augmented Generation)
            </label>
          </div>

          {formData.config.use_rag && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cantidad de Resultados RAG (1-20)
              </label>
              <input
                type="number"
                value={formData.config.rag_results_count}
                onChange={(e) =>
                  updateConfig('rag_results_count', parseInt(e.target.value) || 1)
                }
                min={1}
                max={20}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                  errors.rag_results_count ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {errors.rag_results_count && (
                <p className="mt-1 text-sm text-red-600">{errors.rag_results_count}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Rate Limiting */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Rate Limiting</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Limite de Mensajes
            </label>
            <input
              type="number"
              value={formData.config.rate_limit_messages}
              onChange={(e) =>
                updateConfig('rate_limit_messages', parseInt(e.target.value) || 1)
              }
              min={1}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                errors.rate_limit_messages ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            {errors.rate_limit_messages && (
              <p className="mt-1 text-sm text-red-600">{errors.rate_limit_messages}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Numero maximo de mensajes permitidos
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ventana de Tiempo (segundos)
            </label>
            <input
              type="number"
              value={formData.config.rate_limit_window}
              onChange={(e) =>
                updateConfig('rate_limit_window', parseInt(e.target.value) || 1)
              }
              min={1}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                errors.rate_limit_window ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            {errors.rate_limit_window && (
              <p className="mt-1 text-sm text-red-600">{errors.rate_limit_window}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Periodo de tiempo para el limite de mensajes
            </p>
          </div>
        </div>
      </div>

      {/* Flujo de Captura de Datos */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">
          Flujo de Captura de Datos
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Guia al visitante a traves de preguntas para capturar sus datos de contacto antes de responder con IA.
        </p>

        <div className="space-y-4">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="flow_enabled"
              checked={formData.config.flow?.enabled ?? false}
              onChange={(e) => updateFlow({ enabled: e.target.checked })}
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            />
            <label htmlFor="flow_enabled" className="ml-2 text-sm text-gray-700">
              Habilitar flujo conversacional de captura de datos
            </label>
          </div>

          {formData.config.flow?.enabled && (
            <div className="space-y-4 border-t border-gray-200 pt-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="skip_if_known"
                  checked={formData.config.flow?.skip_if_known ?? true}
                  onChange={(e) => updateFlow({ skip_if_known: e.target.checked })}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
                <label htmlFor="skip_if_known" className="ml-2 text-sm text-gray-700">
                  Omitir preguntas si el dato ya se conoce (clientes recurrentes)
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mensaje al completar el flujo
                </label>
                <textarea
                  value={formData.config.flow?.completion_message ?? ''}
                  onChange={(e) => updateFlow({ completion_message: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Gracias por tus datos. Ahora puedo ayudarte mejor..."
                />
              </div>

              {/* Steps list */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Pasos del Flujo
                  </label>
                  <button
                    type="button"
                    onClick={addFlowStep}
                    className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    + Agregar Paso
                  </button>
                </div>

                {(formData.config.flow?.steps ?? []).length === 0 && (
                  <p className="text-sm text-gray-400 italic">
                    Sin pasos. Agrega pasos para guiar al visitante.
                  </p>
                )}

                <div className="space-y-3">
                  {(formData.config.flow?.steps ?? []).map((step, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Paso {index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeFlowStep(index)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Eliminar
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Campo a capturar
                          </label>
                          <select
                            value={step.field}
                            onChange={(e) => {
                              const field = e.target.value;
                              updateFlowStep(index, {
                                field,
                                field_type:
                                  field === 'email' ? 'email'
                                  : field === 'phone' ? 'phone'
                                  : field === 'case_type' ? 'choice'
                                  : 'text',
                              });
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="name">Nombre</option>
                            <option value="email">Email</option>
                            <option value="phone">Telefono</option>
                            <option value="case_type">Tipo de Caso</option>
                            <option value="description">Descripcion</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Tipo de campo
                          </label>
                          <select
                            value={step.field_type}
                            onChange={(e) =>
                              updateFlowStep(index, { field_type: e.target.value as FlowStep['field_type'] })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="text">Texto libre</option>
                            <option value="email">Email</option>
                            <option value="phone">Telefono</option>
                            <option value="choice">Opciones multiples</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Pregunta al visitante
                        </label>
                        <input
                          type="text"
                          value={step.question}
                          onChange={(e) => updateFlowStep(index, { question: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                          placeholder="¿Cuál es tu nombre completo?"
                        />
                      </div>

                      {step.field_type === 'choice' && (
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Opciones (una por linea)
                          </label>
                          <textarea
                            value={(step.choices ?? []).join('\n')}
                            onChange={(e) =>
                              updateFlowStep(index, {
                                choices: e.target.value.split('\n').filter((c) => c.trim()),
                              })
                            }
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                            placeholder={"Divorcio\nCustodia\nPension alimenticia\nHerencia"}
                          />
                        </div>
                      )}

                      <div className="flex items-center gap-4">
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id={`step_req_${index}`}
                            checked={step.required ?? true}
                            onChange={(e) => updateFlowStep(index, { required: e.target.checked })}
                            className="h-3 w-3 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                          />
                          <label htmlFor={`step_req_${index}`} className="ml-1.5 text-xs text-gray-600">
                            Requerido
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Agente IUS */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-semibold text-gray-900">Agente IUS</h2>
          {formData.config.ius_config ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Configurado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
              Sin configurar
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Carga el archivo <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">ius_system_prompt.json</code> para activar el agente calificador de casos laborales. Si está configurado, reemplaza el System Prompt como instrucción principal del bot.
        </p>

        {/* Aviso: archivo cargado pero no guardado */}
        {iusJustLoaded && (
          <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-lg p-3">
            <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-amber-700">
              Archivo cargado. Hacé click en <strong>Guardar Cambios</strong> para persistir la configuración.
            </p>
          </div>
        )}

        {/* JSON cargado */}
        {formData.config.ius_config && (
          <div className="mb-4 flex items-start gap-3 bg-green-50 border border-green-200 rounded-lg p-3">
            <svg className="w-5 h-5 text-green-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-green-900">
                {iusMeta?.nombre ?? 'Agente IUS cargado'}
              </p>
              {iusMeta?.rol && (
                <p className="text-xs text-green-700 mt-0.5 truncate">{iusMeta.rol}</p>
              )}
            </div>
            <button
              type="button"
              onClick={removeIusConfig}
              className="text-xs text-red-500 hover:text-red-700 shrink-0 font-medium"
            >
              Quitar
            </button>
          </div>
        )}

        {/* Error */}
        {iusError && (
          <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
            <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-red-600">{iusError}</p>
          </div>
        )}

        {/* Botón file picker */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleIusFile}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          {formData.config.ius_config ? 'Reemplazar ius_system_prompt.json' : 'Cargar ius_system_prompt.json'}
        </button>
      </div>

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

export default BotEditForm;
