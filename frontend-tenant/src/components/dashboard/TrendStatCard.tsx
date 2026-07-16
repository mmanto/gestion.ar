import type { ReactNode } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { Card } from '../common/Card';

interface TrendStatCardProps {
  icon: ReactNode;
  title: string;
  /** Valor de la fila del medio, ya formateado (entero, %, moneda, etc.) */
  value: string;
  /** Variación respecto a la semana anterior — se omite la fila de tendencia si no viene */
  weeklyChange?: number;
  /** Si viene, el card se comporta como botón (ej. filtro por semáforo) */
  onClick?: () => void;
  /** Estilo de "activo" cuando el card representa el filtro actualmente aplicado */
  selected?: boolean;
}

const TrendStatCard = ({ icon, title, value, weeklyChange, onClick, selected }: TrendStatCardProps) => {
  const trendColor =
    weeklyChange === undefined
      ? ''
      : weeklyChange > 0
      ? 'text-green-600'
      : weeklyChange < 0
      ? 'text-red-600'
      : 'text-gray-500';

  const card = (
    <Card
      shadow="none"
      className={`transition-colors duration-200 ${onClick ? 'hover:bg-primary-50' : ''} ${selected ? 'ring-2 ring-primary' : ''}`}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          {icon}
          <p className="text-sm font-medium text-gray-800">{title}</p>
        </div>

        <p className="text-2xl font-bold text-gray-900">{value}</p>

        {weeklyChange !== undefined && (
          <div className={`flex items-center gap-1.5 text-sm font-medium ${trendColor}`}>
            {weeklyChange === 0 ? (
              <span>Sin cambios</span>
            ) : (
              <>
                {weeklyChange > 0 ? (
                  <ArrowUp className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <ArrowDown className="w-4 h-4 flex-shrink-0" />
                )}
                <span>{Math.abs(weeklyChange)} en la semana</span>
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );

  if (!onClick) return card;

  return (
    <button type="button" onClick={onClick} className="text-left w-full">
      {card}
    </button>
  );
};

export default TrendStatCard;
