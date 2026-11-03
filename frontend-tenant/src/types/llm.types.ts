/**
 * Proveedor de IA del tenant (ADR-038). La API key se carga acá pero nunca se
 * devuelve: sólo `api_key_hint` (últimos 4 caracteres) para mostrar que hay una
 * key guardada.
 */

export type LLMProvider = 'claude' | 'deepseek' | 'openrouter';

export interface TenantLLMConfig {
  configured: boolean;
  provider: LLMProvider | null;
  model: string | null;
  api_key_hint: string | null;
  last_validated_at: string | null;
  last_error: string | null;
  updated_at: string | null;
  updated_by: string | null;
}
