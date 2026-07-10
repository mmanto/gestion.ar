import React, { createContext, useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { ToastContextType, ToastItem, ToastVariant } from '../types/toast.types';
import { toastBus } from '../services/toastBus';

const AUTO_DISMISS_MS = 6000;

// eslint-disable-next-line react-refresh/only-export-components
export const ToastContext = createContext<ToastContextType | undefined>(undefined);

interface ToastProviderProps {
  children: ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
  }, [dismissToast]);

  // Puente para código fuera de React (interceptor de errores de axios)
  useEffect(() => {
    return toastBus.subscribe(showToast);
  }, [showToast]);

  const value: ToastContextType = { toasts, showToast, dismissToast };

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
};
