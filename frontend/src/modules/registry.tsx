import type { ComponentType } from 'react';
import { BotAppointments } from '../pages/BotAppointments';
import { BotDocuments } from '../pages/BotDocuments';
import { botTabSlug, type ModuleManifest } from './manifest';
import type { BotModuleInfo } from '../types/tenant.types';

/**
 * Contrato de las pantallas de módulo: la ruta las monta detrás de
 * `ModuleGate`, que resuelve la disponibilidad del módulo para el bot y se la
 * pasa ya resuelta (así la pantalla no vuelve a pedirla).
 */
export type ModuleScreenComponent = ComponentType<{ moduleInfo: BotModuleInfo }>;

export interface ModuleScreens {
  /** Pantalla dentro del agente (`/bots/:botId/<slug>`). */
  botTab?: { slug: string; Component: ModuleScreenComponent };
}

/**
 * Único lugar que mapea `module_key` → componente de pantalla. El manifiesto
 * del backend dice QUÉ módulos traen pantalla y con qué label; este registry
 * dice CÓMO se renderiza cada uno en esta SPA.
 */
export const MODULE_SCREENS: Record<string, ModuleScreens> = {
  appointments: {
    botTab: { slug: 'appointments', Component: BotAppointments },
  },
  rag: {
    botTab: { slug: 'documents', Component: BotDocuments },
  },
};

export interface ModuleRoute {
  moduleKey: string;
  /** Último segmento de la ruta, p. ej. `documents`. */
  slug: string;
  Component: ModuleScreenComponent;
}

/** Rutas de los módulos: intersección del manifiesto (que declara la pantalla)
 * con el registry (que declara el componente). */
export function moduleRoutes(modules: ModuleManifest[]): ModuleRoute[] {
  const routes: ModuleRoute[] = [];
  for (const manifest of modules) {
    const screen = MODULE_SCREENS[manifest.module_key]?.botTab;
    if (!screen) continue;
    const declared = (manifest.admin?.bot_tabs ?? []).some(
      (tab) => botTabSlug(tab.path) === screen.slug,
    );
    if (!declared) continue;
    routes.push({ moduleKey: manifest.module_key, slug: screen.slug, Component: screen.Component });
  }
  return routes;
}
