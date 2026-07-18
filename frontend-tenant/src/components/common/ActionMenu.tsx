import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, type LucideIcon } from 'lucide-react';
import { useClickOutside } from '../../hooks/useClickOutside';

export type ActionMenuTone = 'default' | 'yellow' | 'amber' | 'indigo' | 'green' | 'red';

export interface ActionMenuItem {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  /** Se muestra como subtítulo tenue cuando el ítem está deshabilitado. */
  disabledReason?: string;
  tone?: ActionMenuTone;
  /** Marca la fila como "activa" (ej. destacado ya marcado) — tiñe el ícono con el tone. */
  active?: boolean;
}

interface ActionMenuProps {
  items: ActionMenuItem[];
  ariaLabel?: string;
}

const toneIconStyles: Record<ActionMenuTone, string> = {
  default: 'text-gray-500',
  yellow: 'text-yellow-600',
  amber: 'text-amber-600',
  indigo: 'text-indigo-600',
  green: 'text-green-600',
  red: 'text-red-600',
};

const PANEL_WIDTH = 256;
const PANEL_MARGIN = 4;

export const ActionMenu: React.FC<ActionMenuProps> = ({ items, ariaLabel }) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; openUpward: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const computePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const panelHeight = panelRef.current?.offsetHeight ?? items.length * 44 + 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < panelHeight + PANEL_MARGIN && rect.top > panelHeight + PANEL_MARGIN;
    const left = Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - PANEL_MARGIN);
    const top = openUpward ? rect.top - PANEL_MARGIN : rect.bottom + PANEL_MARGIN;
    setPosition({ top, left: Math.max(left, PANEL_MARGIN), openUpward });
  };

  useEffect(() => {
    if (!open) return;
    computePosition();
    const onScrollOrResize = () => computePosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useClickOutside([triggerRef, panelRef], () => setOpen(false), open);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel ?? 'Acciones'}
        className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            style={{
              position: 'fixed',
              top: position?.openUpward ? undefined : position?.top,
              bottom: position?.openUpward ? window.innerHeight - position.top : undefined,
              left: position?.left,
              width: PANEL_WIDTH,
              visibility: position ? 'visible' : 'hidden',
            }}
            className="bg-white rounded-xl shadow-lg ring-1 ring-black/5 overflow-hidden z-50 py-1"
          >
            {items.map((item) => {
              const Icon = item.icon;
              const tone = item.tone ?? 'default';
              return (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    item.onClick();
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left text-gray-900 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  <Icon
                    className={`w-4 h-4 flex-shrink-0 ${toneIconStyles[tone]}`}
                    fill={item.active ? 'currentColor' : 'none'}
                  />
                  <span>
                    <span className="block">{item.label}</span>
                    {item.disabled && item.disabledReason && (
                      <span className="block text-xs text-gray-400">{item.disabledReason}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
};
