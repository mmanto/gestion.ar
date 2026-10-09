import React from 'react';
import { cn } from '../../lib/utils';

export type AlertVariant = 'error' | 'success' | 'info';

interface AlertProps {
  variant?: AlertVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<AlertVariant, string> = {
  error: 'border-destructive/30 bg-destructive/10 text-destructive',
  success: 'border-success/30 bg-success/10 text-success',
  info: 'border-info/30 bg-info/10 text-info',
};

export const Alert: React.FC<AlertProps> = ({ variant = 'error', children, className = '' }) => {
  return (
    <div className={cn('border rounded-lg p-3 text-xs/relaxed', variantStyles[variant], className)}>
      {children}
    </div>
  );
};
