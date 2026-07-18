import React, { createContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { SidebarContextType } from '../types/sidebar.types';

const STORAGE_KEY = 'gestionar-sidebar-collapsed';

// eslint-disable-next-line react-refresh/only-export-components
export const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

interface SidebarProviderProps {
  children: ReactNode;
}

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // localStorage no disponible (modo privado, etc.) — usar default
    return false;
  }
}

export const SidebarProvider: React.FC<SidebarProviderProps> = ({ children }) => {
  const [collapsed, setCollapsedState] = useState<boolean>(readStoredCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  const setCollapsed = (value: boolean) => {
    setCollapsedState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch {
      // ignorar si localStorage no está disponible
    }
  };

  const toggleCollapsed = () => setCollapsed(!collapsed);
  const toggleMobileOpen = () => setMobileOpen((v) => !v);

  const value: SidebarContextType = {
    collapsed,
    setCollapsed,
    toggleCollapsed,
    mobileOpen,
    setMobileOpen,
    toggleMobileOpen,
  };

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
};
