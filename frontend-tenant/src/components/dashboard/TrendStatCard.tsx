import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight, ArrowUp, ArrowDown } from 'lucide-react';

export type StatVariant = 'green' | 'yellow' | 'red' | 'gray' | 'purple' | 'blue';

interface VariantPalette {
  cardBg: string;
  circleBg: string;
  badgeBg: string;
  badgeText: string;
  valueText: string;
  footerBg: string;
  footerText: string;
  ring: string;
}

/** Paleta por categoría de semáforo — calcada de la referencia de diseño del Escritorio. */
const PALETTES: Record<StatVariant, VariantPalette> = {
  green: {
    cardBg: 'bg-green-50',
    circleBg: 'bg-green-500',
    badgeBg: 'bg-green-100',
    badgeText: 'text-green-700',
    valueText: 'text-green-600',
    footerBg: 'bg-green-100',
    footerText: 'text-green-700',
    ring: 'ring-green-500',
  },
  yellow: {
    cardBg: 'bg-amber-50',
    circleBg: 'bg-amber-400',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-700',
    valueText: 'text-amber-500',
    footerBg: 'bg-amber-100',
    footerText: 'text-amber-700',
    ring: 'ring-amber-400',
  },
  red: {
    cardBg: 'bg-red-50',
    circleBg: 'bg-red-500',
    badgeBg: 'bg-red-100',
    badgeText: 'text-red-600',
    valueText: 'text-red-500',
    footerBg: 'bg-red-100',
    footerText: 'text-red-600',
    ring: 'ring-red-500',
  },
  gray: {
    cardBg: 'bg-gray-50',
    circleBg: 'bg-gray-400',
    badgeBg: 'bg-gray-200',
    badgeText: 'text-gray-700',
    valueText: 'text-gray-900',
    footerBg: 'bg-gray-200',
    footerText: 'text-gray-700',
    ring: 'ring-gray-400',
  },
  purple: {
    cardBg: 'bg-violet-50',
    circleBg: 'bg-violet-500',
    badgeBg: 'bg-violet-100',
    badgeText: 'text-violet-700',
    valueText: 'text-violet-600',
    footerBg: 'bg-violet-100',
    footerText: 'text-violet-700',
    ring: 'ring-violet-500',
  },
  blue: {
    cardBg: 'bg-blue-50',
    circleBg: 'bg-blue-500',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-700',
    valueText: 'text-blue-600',
    footerBg: 'bg-blue-100',
    footerText: 'text-blue-700',
    ring: 'ring-blue-500',
  },
};

interface TrendStatCardProps {
  /** Ícono (blanco) que va dentro del círculo de color */
  icon: ReactNode;
  title: string;
  description: string;
  /** Valor de la fila del medio, ya formateado (entero, %, moneda, etc.) */
  value: string;
  /** Variación respecto a la semana anterior — se omite la fila de tendencia si no viene */
  weeklyChange?: number;
  /** Paleta de color de la categoría — define el tinte del card, ícono y franja inferior */
  variant?: StatVariant;
  /** Texto de la franja inferior de acción */
  footerLabel?: string;
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

const TrendStatCard = ({
  icon,
  title,
  description,
  value,
  weeklyChange,
  variant = 'blue',
  footerLabel = 'Ver clientes',
  onClick,
  selected,
}: TrendStatCardProps) => {
  const [ripples, setRipples] = useState<RippleItem[]>([]);
  const nextRippleId = useRef(0);
  const palette = PALETTES[variant];

  const trendColor =
    weeklyChange === undefined
      ? ''
      : weeklyChange > 0
      ? 'text-green-600'
      : weeklyChange < 0
      ? 'text-red-600'
      : palette.valueText;

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

  const content = (
    <div className={`flex flex-col h-full ${palette.cardBg}`}>
      <div className="flex-1 p-5">
        <div className="flex items-center justify-between gap-2 mb-4">
          <span className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${palette.circleBg}`}>
            {icon}
          </span>
          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${palette.badgeBg} ${palette.badgeText}`}>
            {title}
          </span>
        </div>

        <p className="text-sm text-gray-700 leading-snug">{description}</p>

        <p className={`text-4xl font-bold mt-3 ${palette.valueText}`}>{value}</p>

        {weeklyChange !== undefined && (
          <div className={`flex items-center gap-1.5 text-sm font-medium mt-2 ${trendColor}`}>
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

      <div className={`flex items-center justify-between px-5 py-3 ${palette.footerBg}`}>
        <span className={`text-sm font-semibold ${palette.footerText}`}>{footerLabel}</span>
        <ArrowRight className={`w-4 h-4 flex-shrink-0 ${palette.footerText}`} />
      </div>
    </div>
  );

  if (!onClick) {
    return <div className="rounded-2xl overflow-hidden">{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={addRipple}
      className={`relative overflow-hidden text-left w-full rounded-2xl transition-transform duration-150 active:scale-[0.98] ${
        selected ? `ring-2 ${palette.ring}` : ''
      }`}
    >
      {content}
      {ripples.map((r) => (
        <span
          key={r.id}
          onAnimationEnd={() => removeRipple(r.id)}
          className="absolute rounded-full bg-black/10 pointer-events-none animate-ripple"
          style={{ left: r.x, top: r.y, width: r.size, height: r.size }}
        />
      ))}
    </button>
  );
};

export default TrendStatCard;
