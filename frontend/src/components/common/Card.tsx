import React from 'react';
import { cn } from '../../lib/utils';

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'sm' | 'md' | 'lg' | 'none';
  shadow?: 'sm' | 'md' | 'lg' | 'none';
  hover?: boolean;
}

const paddingStyles: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

const shadowStyles: Record<NonNullable<CardProps['shadow']>, string> = {
  none: '',
  sm: 'shadow-xs',
  md: 'shadow-sm',
  lg: 'shadow-md',
};

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  padding = 'md',
  shadow = 'md',
  hover = false,
}) => (
  <div
    className={cn(
      'bg-card text-card-foreground rounded-xl border border-border',
      paddingStyles[padding],
      shadowStyles[shadow],
      hover && 'hover:shadow-sm transition-shadow duration-200',
      className
    )}
  >
    {children}
  </div>
);

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ children, className = '' }) => (
  <div className={cn('mb-4', className)}>{children}</div>
);

interface CardTitleProps {
  children: React.ReactNode;
  className?: string;
}

export const CardTitle: React.FC<CardTitleProps> = ({ children, className = '' }) => (
  <h3 className={cn('text-sm font-medium text-foreground', className)}>
    {children}
  </h3>
);

interface CardContentProps {
  children: React.ReactNode;
  className?: string;
}

export const CardContent: React.FC<CardContentProps> = ({ children, className }) => (
  <div className={className}>{children}</div>
);
