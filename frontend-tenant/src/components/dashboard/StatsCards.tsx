import { ChartColumnIncreasing, Filter, ClipboardCheck, MailOpen } from 'lucide-react';
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
    <div className={`grid ${mobileCols} md:grid-cols-2 lg:grid-cols-4 gap-4`}>
      <TrendStatCard
        variant="green"
        icon={<ChartColumnIncreasing className="w-12 h-12 opacity-50" strokeWidth={1.5} />}
        title="VIABLE"
        description="Clientes con alto potencial para avanzar."
        value={formatNumber(colorStats.verde)}
        caption="clientes"
        onClick={onSelectColor ? () => onSelectColor('verde') : undefined}
        selected={selectedColor === 'verde'}
      />
      <TrendStatCard
        variant="yellow"
        icon={<Filter className="w-12 h-12 opacity-50" strokeWidth={1.5} />}
        title="POTENCIAL"
        description="Clientes con potencial de conversión."
        value={formatNumber(colorStats.amarillo)}
        caption="clientes"
        onClick={onSelectColor ? () => onSelectColor('amarillo') : undefined}
        selected={selectedColor === 'amarillo'}
      />
      <TrendStatCard
        variant="red"
        icon={<ClipboardCheck className="w-12 h-12 opacity-50" strokeWidth={1.5} />}
        title="EXPLORACIÓN"
        description="Clientes en evaluación inicial."
        value={formatNumber(colorStats.rojo)}
        caption="clientes"
        onClick={onSelectColor ? () => onSelectColor('rojo') : undefined}
        selected={selectedColor === 'rojo'}
      />
      <TrendStatCard
        variant="purple"
        icon={<MailOpen className="w-12 h-12 opacity-50" strokeWidth={1.5} />}
        title="Solicitan contacto"
        description="Clientes que solicitaron contacto."
        value={formatNumber(colorStats.sin_clasificar)}
        caption="clientes"
        onClick={onSelectColor ? () => onSelectColor('sin_clasificar') : undefined}
        selected={selectedColor === 'sin_clasificar'}
      />
    </div>
  );
};

export default StatsCards;
