import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight, ArrowUp, ArrowDown } from 'lucide-react';

export type StatVariant = 'green' | 'yellow' | 'red' | 'gray' | 'purple' | 'blue';

interface VariantPalette {
  /** Degradado 150° de fondo del card — calcado de la referencia dashboard_clientes.html */
  gradient: string;
  /** Color de acento: píldora del badge, número e ícono */
  accent: string;
  /** Sombra difusa de la píldora, en la familia del acento */
  badgeShadow: string;
  /** Fondo de la franja inferior */
  footerBg: string;
  /** Texto/flecha de la franja inferior */
  footerText: string;
}

/**
 * Paleta por categoría de semáforo — calcada de la referencia de diseño del
 * Escritorio (dashboard_clientes.html): degradado suave, píldora de color
 * sólida, número grande con acento, ícono al costado y franja inferior con
 * la acción "Ver clientes".
 */
const PALETTES: Record<StatVariant, VariantPalette> = {
  green: {
    gradient: 'linear-gradient(150deg,#d9f2e2 0%,#f2faf5 55%,#ffffff 100%)',
    accent: '#4eb86b',
    badgeShadow: '0 8px 16px -6px rgba(78,184,107,0.55)',
    footerBg: '#d8f0de',
    footerText: '#16903e',
  },
  yellow: {
    gradient: 'linear-gradient(150deg,#fcecc7 0%,#fbf5e7 55%,#ffffff 100%)',
    accent: '#f2bd23',
    badgeShadow: '0 8px 16px -6px rgba(242,189,35,0.55)',
    footerBg: '#faedc4',
    footerText: '#8a6407',
  },
  red: {
    gradient: 'linear-gradient(150deg,#fbdedd 0%,#fbeeed 55%,#ffffff 100%)',
    accent: '#e54442',
    badgeShadow: '0 8px 16px -6px rgba(229,68,66,0.55)',
    footerBg: '#fbdedd',
    footerText: '#ab332f',
  },
  purple: {
    gradient: 'linear-gradient(150deg,#e9dffb 0%,#f3eefb 55%,#ffffff 100%)',
    accent: '#844df2',
    badgeShadow: '0 8px 16px -6px rgba(132,77,242,0.55)',
    footerBg: '#e9dffb',
    footerText: '#5a2fc2',
  },
  gray: {
    gradient: 'linear-gradient(150deg,#eceef1 0%,#f5f6f8 55%,#ffffff 100%)',
    accent: '#8a94a6',
    badgeShadow: '0 8px 16px -6px rgba(138,148,166,0.55)',
    footerBg: '#e3e6eb',
    footerText: '#5c6778',
  },
  blue: {
    gradient: 'linear-gradient(150deg,#dbeafe 0%,#eff5ff 55%,#ffffff 100%)',
    accent: '#3b82f6',
    badgeShadow: '0 8px 16px -6px rgba(59,130,246,0.55)',
    footerBg: '#dbeafe',
    footerText: '#1d4ed8',
  },
};

interface TrendStatCardProps {
  /** Ícono (se tiñe con el acento de la categoría). Pasarlo sin clases de
   * color; el tamaño lo controla el propio card (caja de 72px al costado). */
  icon: ReactNode;
  title: string;
  description: string;
  /** Valor de la fila del medio, ya formateado (entero, %, moneda, etc.) */
  value: string;
  /** Texto chico debajo del número (ej. "clientes") — se omite si no viene */
  caption?: string;
  /** Variación respecto a la semana anterior — se omite la fila de tendencia si no viene */
  weeklyChange?: number;
  /** Paleta de color de la categoría — define el degradado, píldora y franja inferior */
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
  caption,
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
      ? undefined
      : weeklyChange > 0
      ? '#16a34a'
      : weeklyChange < 0
      ? '#dc2626'
      : palette.accent;

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
    <div className="flex flex-col h-full" style={{ background: palette.gradient }}>
      <div className="pt-[26px] px-5 pb-[18px]">
        <span
          className="inline-block px-[15px] py-[9px] rounded-full text-white text-[8.5px] font-semibold uppercase tracking-[0.1px] whitespace-nowrap mb-[26px]"
          style={{ backgroundColor: palette.accent, boxShadow: palette.badgeShadow }}
        >
          {title}
        </span>

        <p className="text-[15.5px] leading-[1.32] text-[#0b1f3a] mb-[26px] min-h-[90px]">{description}</p>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[44px] font-bold leading-none" style={{ color: palette.accent }}>
              {value}
            </p>
            {caption && <p className="text-[13.5px] text-[#9a9fa8] mt-[6px]">{caption}</p>}
          </div>
          <span
            className="w-[72px] h-[72px] flex-shrink-0 flex items-center justify-center"
            style={{ color: palette.accent }}
          >
            {icon}
          </span>
        </div>

        {weeklyChange !== undefined && (
          <div className="flex items-center gap-1.5 text-sm font-medium mt-2" style={{ color: trendColor }}>
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

      <div
        className="mt-auto flex items-center justify-between px-[22px] py-[18px]"
        style={{ backgroundColor: palette.footerBg, color: palette.footerText }}
      >
        <span className="text-base font-semibold">{footerLabel}</span>
        <ArrowRight className="w-[18px] h-[14px] flex-shrink-0 transition-transform duration-150 group-hover:translate-x-[3px]" />
      </div>
    </div>
  );

  if (!onClick) {
    return (
      <div className="rounded-[28px] overflow-hidden transition-[filter] duration-150 group hover:brightness-[0.97]">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={addRipple}
      className={`relative overflow-hidden text-left w-full h-full rounded-[28px] transition-[filter,transform] duration-150 group hover:brightness-[0.97] active:brightness-[0.95] active:scale-[0.98]`}
      style={selected ? { boxShadow: `0 0 0 3px ${palette.accent}` } : undefined}
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
