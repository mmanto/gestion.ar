/**
 * Tenant LLM Config Service — proveedor de IA del tenant (Ajustes › Proveedor
 * de IA). La key viaja sólo en el PUT; el backend la valida contra el
 * proveedor antes de guardarla cifrada.
 */

import api from './api';
import type { LLMProvider, TenantLLMConfig } from '../types/llm.types';

const llmConfigService = {
  async get(): Promise<TenantLLMConfig> {
    const { data } = await api.get<{ success: boolean; config: TenantLLMConfig }>(
      '/tenant/llm-config'
    );
    return data.config;
  },

  async save(
    provider: LLMProvider,
    model: string,
    apiKey?: string
  ): Promise<TenantLLMConfig> {
    const { data } = await api.put<{ success: boolean; config: TenantLLMConfig }>(
      '/tenant/llm-config',
      apiKey ? { provider, model, api_key: apiKey } : { provider, model }
    );
    return data.config;
  },

  async validate(): Promise<{ valid: boolean; error: string | null }> {
    const { data } = await api.post<{ success: boolean; valid: boolean; error: string | null }>(
      '/tenant/llm-config/validate'
    );
    return { valid: data.valid, error: data.error };
  },

  async remove(): Promise<boolean> {
    const { data } = await api.delete<{ success: boolean; deleted: boolean }>(
      '/tenant/llm-config'
    );
    return data.deleted;
  },
};

export default llmConfigService;
