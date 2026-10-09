import React from 'react';
import { cn } from '../../lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Clases adicionales para el <h1>, para páginas que necesitan un tratamiento propio del título */
  titleClassName?: string;
  /** Clases adicionales para la descripción, para páginas que necesitan un tratamiento propio */
  descriptionClassName?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  actions,
  titleClassName = '',
  descriptionClassName = '',
}) => {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className={cn('font-heading heading-screen font-medium text-foreground', titleClassName)}>
          {title}
        </h1>
        {description && (
          <p className={cn('text-xs/relaxed text-muted-foreground', descriptionClassName)}>
            {description}
          </p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
};
