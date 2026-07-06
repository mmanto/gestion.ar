import type React from 'react';
import type { TemplateId } from '../types/template.types';
import { DefaultAppLayout } from './default/AppLayout';
import { KeroAppLayout } from './kero/AppLayout';

export interface TemplateDefinition {
  id: TemplateId;
  label: string;
  AppLayout: React.FC<{ children: React.ReactNode }>;
}

export const TEMPLATES: TemplateDefinition[] = [
  { id: 'default', label: 'Clásico', AppLayout: DefaultAppLayout },
  { id: 'kero',    label: 'Kero',    AppLayout: KeroAppLayout },
];

export const TEMPLATE_MAP: Record<TemplateId, TemplateDefinition> = Object.fromEntries(
  TEMPLATES.map(t => [t.id, t])
) as Record<TemplateId, TemplateDefinition>;
