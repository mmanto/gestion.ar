import React from 'react';

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
  titleClassName = 'font-bold',
  descriptionClassName = 'text-gray-600',
}) => {
  return (
    <div className="flex items-start justify-between mb-8">
      <div>
        <h1 className={`text-3xl text-gray-900 ${titleClassName}`}>{title}</h1>
        {description && <p className={`mt-1 ${descriptionClassName}`}>{description}</p>}
      </div>
      {actions && <div className="flex-shrink-0">{actions}</div>}
    </div>
  );
};
