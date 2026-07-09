import type { FlowConfig, FlowStep } from '../types/bot.types';

const VALID_FIELD_TYPES = ['text', 'email', 'phone', 'choice'] as const;

export interface FlowConfigParseResult {
  valid: boolean;
  value?: FlowConfig;
  errors: string[];
}

export function parseFlowConfigJson(raw: string): FlowConfigParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { valid: false, errors: ['El texto no es JSON válido.'] };
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, errors: ['El JSON debe ser un objeto.'] };
  }

  const obj = data as Record<string, unknown>;
  const errors: string[] = [];

  if (obj.steps !== undefined && !Array.isArray(obj.steps)) {
    errors.push('"steps" debe ser un array.');
  }

  const steps: FlowStep[] = [];
  if (Array.isArray(obj.steps)) {
    obj.steps.forEach((rawStep, i) => {
      if (!rawStep || typeof rawStep !== 'object') {
        errors.push(`El paso ${i + 1} debe ser un objeto.`);
        return;
      }
      const step = rawStep as Record<string, unknown>;

      if (typeof step.field !== 'string' || !step.field.trim()) {
        errors.push(`El paso ${i + 1} necesita "field" (string).`);
      }
      if (typeof step.question !== 'string' || !step.question.trim()) {
        errors.push(`El paso ${i + 1} necesita "question" (string).`);
      }

      const fieldType = (step.field_type as string) ?? 'text';
      if (!VALID_FIELD_TYPES.includes(fieldType as (typeof VALID_FIELD_TYPES)[number])) {
        errors.push(`El paso ${i + 1} tiene "field_type" inválido: ${fieldType}.`);
      }
      if (fieldType === 'choice' && !Array.isArray(step.choices)) {
        errors.push(`El paso ${i + 1} es de tipo "choice" y necesita "choices" (array de strings).`);
      }

      steps.push({
        field: String(step.field ?? ''),
        question: String(step.question ?? ''),
        field_type: fieldType as FlowStep['field_type'],
        choices: Array.isArray(step.choices) ? step.choices.map(String) : undefined,
        required: step.required === undefined ? true : Boolean(step.required),
        validation_hint: typeof step.validation_hint === 'string' ? step.validation_hint : undefined,
        score_weight: typeof step.score_weight === 'number' ? step.score_weight : undefined,
      });
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    value: {
      enabled: obj.enabled === undefined ? true : Boolean(obj.enabled),
      steps,
      completion_message:
        typeof obj.completion_message === 'string'
          ? obj.completion_message
          : '¡Gracias! He registrado tu información. Ahora puedes contarme más sobre tu caso.',
      skip_if_known: obj.skip_if_known === undefined ? true : Boolean(obj.skip_if_known),
    },
  };
}
