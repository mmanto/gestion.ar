import React from 'react';
import { cn } from '../../lib/utils';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  titleClassName?: string;
  descriptionClassName?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  titleClassName = '',
  descriptionClassName = '',
}) => (
  <div className="py-12 text-center">
    <div className="size-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center text-muted-foreground">
      {icon}
    </div>
    <p className={cn('text-sm font-medium text-foreground', titleClassName)}>{title}</p>
    {description && (
      <p className={cn('text-xs/relaxed text-muted-foreground', descriptionClassName)}>
        {description}
      </p>
    )}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
