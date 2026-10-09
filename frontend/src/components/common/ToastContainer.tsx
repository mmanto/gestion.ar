import React from 'react';
import type { ToastVariant } from '../../types/toast.types';
import { useToast } from '../../hooks/useToast';

const variantStyles: Record<ToastVariant, string> = {
  error: 'bg-destructive text-primary-foreground',
  success: 'bg-success text-primary-foreground',
  info: 'bg-foreground text-background',
};

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="alert"
          className={`pointer-events-auto flex items-start justify-between gap-3 rounded-lg shadow-md px-3 py-2 text-xs/relaxed ${variantStyles[toast.variant]}`}
        >
          <span className="flex-1">{toast.message}</span>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            className="shrink-0 opacity-80 hover:opacity-100"
            aria-label="Cerrar notificación"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};
