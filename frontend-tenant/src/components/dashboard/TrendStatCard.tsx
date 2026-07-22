import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { Card } from '../common/Card';

const BUTTON_BG = '#80a9eb';

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

interface RippleItem {
  id: number;
  x: number;
  y: number;
  size: number;
}

const TrendStatCard = ({ icon, title, value, weeklyChange, onClick, selected }: TrendStatCardProps) => {
  const [ripples, setRipples] = useState<RippleItem[]>([]);
  const nextRippleId = useRef(0);

  const trendColor =
    weeklyChange === undefined
      ? ''
      : weeklyChange > 0
      ? 'text-green-300'
      : weeklyChange < 0
      ? 'text-red-300'
      : 'text-blue-100';

  const addRipple = (e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const id = nextRippleId.current++;
    setRipples((prev) => [
      ...prev,
      { id, x: e.clientX - rect.left - size / 2, y: e.clientY - rect.top - size / 2, size },
    ]);
  };

  const removeRipple = (id: number) => {
    setRipples((prev) => prev.filter((r) => r.id !== id));
  };

  const card = (
    <Card
      shadow="none"
      className={onClick ? 'text-white' : ''}
      style={onClick ? { backgroundColor: BUTTON_BG, borderColor: BUTTON_BG } : undefined}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2 min-h-[2.625rem]">
          {icon}
          <p className={`text-sm font-medium ${onClick ? 'text-blue-50' : 'text-gray-800'}`}>{title}</p>
        </div>

        <p className={`text-2xl font-bold ${onClick ? 'text-white' : 'text-gray-900'}`}>{value}</p>

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
    <button
      type="button"
      onClick={onClick}
      onPointerDown={addRipple}
      className={`relative overflow-hidden text-left w-full rounded-lg transition-transform duration-150 active:scale-[0.98] ${
        selected ? 'ring-2 ring-white' : ''
      }`}
    >
      {card}
      {ripples.map((r) => (
        <span
          key={r.id}
          onAnimationEnd={() => removeRipple(r.id)}
          className="absolute rounded-full bg-white/40 pointer-events-none animate-ripple"
          style={{ left: r.x, top: r.y, width: r.size, height: r.size }}
        />
      ))}
    </button>
  );
};

export default TrendStatCard;
