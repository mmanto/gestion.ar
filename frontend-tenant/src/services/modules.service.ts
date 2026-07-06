/**
 * Modules Service (frontend-tenant) - habilitar/deshabilitar módulos ya
 * otorgados por administración general, y editar custom_facts.
 */

import api from './api';
import type { BotModuleInfo } from '../types/tenant.types';

const modulesService = {
  async getBotModules(botId: string): Promise<BotModuleInfo[]> {
    const response = await api.get<{ success: boolean; modules: BotModuleInfo[] }>(`/tenant/bots/${botId}/modules`);
    return response.data.modules;
  },

  async setModuleEnabled(botId: string, moduleKey: string, enabled: boolean): Promise<BotModuleInfo> {
    const response = await api.patch<{ success: boolean; module: BotModuleInfo }>(
      `/tenant/bots/${botId}/modules/${moduleKey}`,
      { enabled }
    );
    return response.data.module;
  },

  async getCustomFacts(botId: string): Promise<Record<string, string>> {
    const response = await api.get<{ success: boolean; custom_facts: Record<string, string> }>(
      `/tenant/bots/${botId}/training/custom-facts`
    );
    return response.data.custom_facts;
  },

  async updateCustomFacts(botId: string, customFacts: Record<string, string>): Promise<Record<string, string>> {
    const response = await api.patch<{ success: boolean; custom_facts: Record<string, string> }>(
      `/tenant/bots/${botId}/training/custom-facts`,
      { custom_facts: customFacts }
    );
    return response.data.custom_facts;
  },
};

export default modulesService;
