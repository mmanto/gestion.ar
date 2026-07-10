import { useContext } from 'react';
import { ToastContext } from '../context/ToastContext';
import type { ToastContextType } from '../types/toast.types';

/**
 * Hook para acceder al sistema de notificaciones toast
 *
 * @throws Error si se usa fuera de un ToastProvider
 */
export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast debe usarse dentro de un ToastProvider');
  }

  return context;
};
