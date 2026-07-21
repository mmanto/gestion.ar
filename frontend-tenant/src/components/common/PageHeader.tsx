import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Si se pasa, muestra una flecha de volver a la izquierda del título en vez de
   * un botón de acción aparte — patrón de app bar nativo para pantallas que son
   * un "drill-down" en el mismo componente (ej. filtro por categoría) en vez de
   * un cambio de ruta. Para navegación por ruta, ver `Navbar`'s `backTo`. */
  onBack?: () => void;
  /** Clases adicionales para el <h1>, para páginas que necesitan un tratamiento propio del título */
  titleClassName?: string;
  /** Clases adicionales para la descripción, para páginas que necesitan un tratamiento propio */
  descriptionClassName?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  actions,
  onBack,
  titleClassName = 'font-bold',
  descriptionClassName = 'text-gray-800',
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
      <div className="flex items-start gap-2">
        {onBack && (
          <button
            onClick={onBack}
            aria-label="Volver"
            className="-ml-2 mt-0.5 p-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <div>
          <h1 className={`text-3xl text-gray-900 ${titleClassName}`}>{title}</h1>
          {description && <p className={`mt-1 ${descriptionClassName}`}>{description}</p>}
        </div>
      </div>
      {actions && <div className="flex-shrink-0">{actions}</div>}
    </div>
  );
};
