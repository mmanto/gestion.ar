export const TEMPLATE_IDS = ['default', 'kero', 'devbout', 'urbanvoice'] as const;

export type TemplateId = (typeof TEMPLATE_IDS)[number];

export interface TemplateOption {
  id: TemplateId;
  label: string;
}

export interface TemplateContextType {
  templateId: TemplateId;
  /** Persiste el tema para todo el tenant (PATCH /tenant/branding, solo admin) — ver TemplateContext.tsx. */
  setTemplateId: (id: TemplateId) => Promise<void>;
  templates: TemplateOption[];
}
