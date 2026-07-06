import { useContext } from 'react';
import { SidebarContext } from '../context/SidebarContext';
import type { SidebarContextType } from '../types/sidebar.types';

/**
 * Hook para acceder al contexto de colapso de la sidebar
 *
 * @throws Error si se usa fuera de un SidebarProvider
 */
export const useSidebar = (): SidebarContextType => {
  const context = useContext(SidebarContext);

  if (!context) {
    throw new Error('useSidebar debe usarse dentro de un SidebarProvider');
  }

  return context;
};
