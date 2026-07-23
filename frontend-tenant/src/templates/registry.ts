import type React from 'react';
import type { TemplateId } from '../types/template.types';
import type { ColorFilter } from '../types/client.types';
import { DefaultAppLayout } from './default/AppLayout';
import { KeroAppLayout } from './kero/AppLayout';
import DefaultClientsGrid from '../components/dashboard/ClientsGrid';
import KeroClientsGrid from './kero/ClientsGrid';

export interface TemplateDefinition {
  id: TemplateId;
  label: string;
  AppLayout: React.FC<{ children: React.ReactNode }>;
  /** Grilla de clientes del Escritorio — la única pieza de contenido (no de
   * layout) con diseño propio por tema hasta ahora, ver ClientsGrid de kero. */
  ClientsGrid: React.FC<{ colorFilter?: ColorFilter }>;
}

export const TEMPLATES: TemplateDefinition[] = [
  { id: 'default', label: 'Clásico', AppLayout: DefaultAppLayout, ClientsGrid: DefaultClientsGrid },
  { id: 'kero',    label: 'Kero',    AppLayout: KeroAppLayout,    ClientsGrid: KeroClientsGrid },
];

export const TEMPLATE_MAP: Record<TemplateId, TemplateDefinition> = Object.fromEntries(
  TEMPLATES.map(t => [t.id, t])
) as Record<TemplateId, TemplateDefinition>;
