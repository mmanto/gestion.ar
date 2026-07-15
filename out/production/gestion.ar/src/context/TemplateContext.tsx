import React, { createContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { TemplateContextType, TemplateId } from '../types/template.types';
import { TEMPLATES, TEMPLATE_MAP } from '../templates/registry';

const STORAGE_KEY = 'gestionar-template';

// eslint-disable-next-line react-refresh/only-export-components
export const TemplateContext = createContext<TemplateContextType | undefined>(undefined);

interface TemplateProviderProps {
  children: ReactNode;
}

function readStoredTemplateId(): TemplateId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored in TEMPLATE_MAP) {
      return stored as TemplateId;
    }
  } catch {
    // localStorage no disponible (modo privado, etc.) — usar default
  }
  return 'kero';
}

export const TemplateProvider: React.FC<TemplateProviderProps> = ({ children }) => {
  const [templateId, setTemplateIdState] = useState<TemplateId>(readStoredTemplateId);

  const setTemplateId = (id: TemplateId) => {
    setTemplateIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignorar si localStorage no está disponible
    }
  };

  const value: TemplateContextType = {
    templateId,
    setTemplateId,
    templates: TEMPLATES.map(({ id, label }) => ({ id, label })),
  };

  return <TemplateContext.Provider value={value}>{children}</TemplateContext.Provider>;
};
