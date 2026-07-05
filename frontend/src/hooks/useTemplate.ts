import { useContext } from 'react';
import { TemplateContext } from '../context/TemplateContext';
import type { TemplateContextType } from '../types/template.types';

/**
 * Hook para acceder al contexto de templates
 *
 * @throws Error si se usa fuera de un TemplateProvider
 */
export const useTemplate = (): TemplateContextType => {
  const context = useContext(TemplateContext);

  if (!context) {
    throw new Error('useTemplate debe usarse dentro de un TemplateProvider');
  }

  return context;
};
