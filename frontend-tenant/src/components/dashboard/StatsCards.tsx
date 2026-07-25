import { Check, Star, Search, User } from 'lucide-react';
import TrendStatCard from './TrendStatCard';
import { formatNumber } from '../../utils/formatters';
import { useTenant } from '../../hooks/useTenant';
import type { ClientColorStats, ColorFilter } from '../../types/client.types';

interface StatsCardsProps {
  colorStats: ClientColorStats;
  selectedColor?: ColorFilter | null;
  onSelectColor?: (color: ColorFilter) => void;
}

const StatsCards = ({ colorStats, selectedColor, onSelectColor }: StatsCardsProps) => {
  const { statsTwoColsMobile } = useTenant();
  const mobileCols = statsTwoColsMobile ? 'grid-cols-2' : 'grid-cols-1';

  return (
    <div className={`grid ${mobileCols} md:grid-cols-2 lg:grid-cols-4 gap-3`}>
      <TrendStatCard
        variant="green"
        icon={<Check className="w-5 h-5 text-white" />}
        title="VIABLE"
        description="Clientes con alto potencial y listos para avanzar."
        value={formatNumber(colorStats.verde)}
        onClick={onSelectColor ? () => onSelectColor('verde') : undefined}
        selected={selectedColor === 'verde'}
      />
      <TrendStatCard
        variant="yellow"
        icon={<Star className="w-5 h-5 text-white" />}
        title="POTENCIAL"
        description="Clientes interesados, con potencial de conversión."
        value={formatNumber(colorStats.amarillo)}
        onClick={onSelectColor ? () => onSelectColor('amarillo') : undefined}
        selected={selectedColor === 'amarillo'}
      />
      <TrendStatCard
        variant="red"
        icon={<Search className="w-5 h-5 text-white" />}
        title="EXPLORACIÓN"
        description="Clientes en evaluación inicial."
        value={formatNumber(colorStats.rojo)}
        onClick={onSelectColor ? () => onSelectColor('rojo') : undefined}
        selected={selectedColor === 'rojo'}
      />
      <TrendStatCard
        variant="purple"
        icon={<User className="w-5 h-5 text-white" />}
        title="Solicitan contacto"
        description="Clientes sin clasificación asignada."
        value={formatNumber(colorStats.sin_clasificar)}
        onClick={onSelectColor ? () => onSelectColor('sin_clasificar') : undefined}
        selected={selectedColor === 'sin_clasificar'}
      />
    </div>
  );
};

export default StatsCards;
