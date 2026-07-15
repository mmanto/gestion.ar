export type TemplateId = 'default' | 'kero';

export interface TemplateOption {
  id: TemplateId;
  label: string;
}

export interface TemplateContextType {
  templateId: TemplateId;
  setTemplateId: (id: TemplateId) => void;
  templates: TemplateOption[];
}
