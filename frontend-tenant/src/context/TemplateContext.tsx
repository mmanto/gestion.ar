import React, { createContext } from 'react';
import type { ReactNode } from 'react';
import type { TemplateContextType, TemplateId } from '../types/template.types';
import { TEMPLATES, TEMPLATE_MAP } from '../templates/registry';
import { useTenant } from '../hooks/useTenant';
import tenantBrandingService from '../services/tenantBranding.service';

// eslint-disable-next-line react-refresh/only-export-components
export const TemplateContext = createContext<TemplateContextType | undefined>(undefined);

interface TemplateProviderProps {
  children: ReactNode;
}

// El tema es una preferencia del TENANT (la elige el admin en Ajustes >
// Marca), no del navegador de cada usuario — se guarda en
// tenant.branding.template_id (PATCH /tenant/branding, admin-only) en vez de
// localStorage, así todos los usuarios del tenant ven el mismo tema. 'kero'
// es el default para quien todavía no lo eligió explícitamente.
function resolveTemplateId(stored: string | undefined): TemplateId {
  if (stored && stored in TEMPLATE_MAP) {
    return stored as TemplateId;
  }
  return 'kero';
}

export const TemplateProvider: React.FC<TemplateProviderProps> = ({ children }) => {
  const { tenant, refetchTenant } = useTenant();
  const templateId = resolveTemplateId(tenant?.branding.template_id);

  const setTemplateId = async (id: TemplateId) => {
    await tenantBrandingService.updateBranding({ template_id: id });
    await refetchTenant();
  };

  const value: TemplateContextType = {
    templateId,
    setTemplateId,
    templates: TEMPLATES.map(({ id, label }) => ({ id, label })),
  };

  return <TemplateContext.Provider value={value}>{children}</TemplateContext.Provider>;
};
