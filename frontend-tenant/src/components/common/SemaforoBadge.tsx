import type { SemaforoColor } from '../../services/modules.service';

const semaforoDotClass: Record<SemaforoColor, string> = {
  verde: 'bg-green-500',
  amarillo: 'bg-yellow-500',
  rojo: 'bg-red-500',
};

interface SemaforoBadgeProps {
  color?: SemaforoColor | null;
  estado: string;
}

export const SemaforoBadge = ({ color, estado }: SemaforoBadgeProps) => (
  <div className="flex items-center gap-2">
    <span
      title={color ? `Calificación automática: ${color}` : 'Sin calificar'}
      className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${color ? semaforoDotClass[color] : 'bg-gray-300'}`}
    />
    <span className="text-base text-gray-800 capitalize">{estado}</span>
  </div>
);
