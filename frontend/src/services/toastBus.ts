import type { ToastVariant } from '../types/toast.types';

/**
 * Bus mínimo para emitir toasts desde código fuera del árbol de React
 * (ej. el interceptor de errores de axios en api.ts). ToastProvider se
 * suscribe una vez montado.
 */
type ToastListener = (message: string, variant: ToastVariant) => void;

let listener: ToastListener | null = null;

export const toastBus = {
  subscribe(fn: ToastListener): () => void {
    listener = fn;
    return () => {
      if (listener === fn) listener = null;
    };
  },
  emit(message: string, variant: ToastVariant = 'error'): void {
    listener?.(message, variant);
  },
};
