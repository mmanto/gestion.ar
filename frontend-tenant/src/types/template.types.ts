export type TemplateId = 'default' | 'kero';

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
