import api from '../services/api';

/**
 * Tipos espejo de la proyección pública del manifiesto de módulos del backend
 * (`GET /api/public/modules/manifest`, ver backend/app/modules/manifest.py).
 * El manifiesto es la fuente de verdad de qué módulos están instalados y de
 * qué superficies trae cada uno (navegación, pantallas, widgets de chat).
 */
export interface ModuleNavEntry {
  to: string;
  label: string;
  icon: string;
  roles: string[];
}

export interface ModuleBotTab {
  /** Ruta con el placeholder `:botId` (p. ej. `/bots/:botId/documents`). */
  path: string;
  label: string;
}

export interface ModuleAdminScreens {
  nav: ModuleNavEntry | null;
  bot_tabs: ModuleBotTab[];
}

export interface ModuleTenantScreens {
  nav: ModuleNavEntry[];
}

export interface ModuleChatContribution {
  widget_types: string[];
}

export interface ModuleManifest {
  module_key: string;
  name: string;
  description: string;
  version: string;
  scope: 'platform' | 'entitled';
  requires: string[];
  admin: ModuleAdminScreens | null;
  tenant: ModuleTenantScreens | null;
  chat: ModuleChatContribution | null;
}

export async function fetchModuleManifest(): Promise<ModuleManifest[]> {
  const response = await api.get<{ modules: ModuleManifest[] }>('/public/modules/manifest');
  return response.data.modules;
}

/** Slug de la pantalla dentro del agente, derivado del path del manifiesto
 * (`/bots/:botId/documents` → `documents`). */
export function botTabSlug(path: string): string {
  const segments = path.split('/');
  return segments[segments.length - 1];
}
