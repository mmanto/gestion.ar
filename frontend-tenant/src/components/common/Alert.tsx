import React from 'react';

export type AlertVariant = 'error' | 'success' | 'info';

interface AlertProps {
  variant?: AlertVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<AlertVariant, string> = {
  error: 'bg-red-50 border-red-200 text-red-800',
  success: 'bg-green-50 border-green-200 text-green-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
};

export const Alert: React.FC<AlertProps> = ({ variant = 'error', children, className = '' }) => {
  return (
    <div className={`border rounded-lg p-4 text-sm ${variantStyles[variant]} ${className}`}>
      {children}
    </div>
  );
};
