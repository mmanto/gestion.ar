import { initials } from '../demo/format';
import type { Partner } from '../demo/types';

/** Fallback de la demo: iniciales sobre el color del partner (sin imágenes). */
export function PartnerLogo({ p, size = 40 }: { p: Partner; size?: number }) {
  return (
    <span className="clogo" style={{ width: size, height: size, background: p.color, fontSize: Math.round(size * 0.38) }}>
      {initials(p.name)}
    </span>
  );
}
