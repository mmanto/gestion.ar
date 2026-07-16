import TrendStatCard from './TrendStatCard';
import { formatNumber } from '../../utils/formatters';
import { useTenant } from '../../hooks/useTenant';
import type { ClientColorStats, ColorFilter } from '../../types/client.types';

interface StatsCardsProps {
  colorStats: ClientColorStats;
  selectedColor?: ColorFilter | null;
  onSelectColor?: (color: ColorFilter) => void;
}

// Pedido puntual del tenant ius: 2 cards por fila en mobile en vez de 1.
const IUS_TENANT_ID = 'tenant_6a10b2076443';

/** Punto de semáforo — código de color por nivel (viable/potencial/exploración/sin clasificar). */
const TrafficLight = ({ color }: { color: 'green' | 'yellow' | 'red' | 'gray' }) => {
  const bg = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-400',
    red: 'bg-red-500',
    gray: 'bg-gray-400',
  }[color];
  return <span className={`w-5 h-5 rounded-full flex-shrink-0 ${bg}`} />;
};

const StatsCards = ({ colorStats, selectedColor, onSelectColor }: StatsCardsProps) => {
  const { tenantId } = useTenant();
  const mobileCols = tenantId === IUS_TENANT_ID ? 'grid-cols-2' : 'grid-cols-1';

  return (
    <div className={`grid ${mobileCols} md:grid-cols-2 lg:grid-cols-4 gap-6`}>
      <TrendStatCard
        icon={<TrafficLight color="green" />}
        title="VIABLE"
        value={formatNumber(colorStats.verde)}
        onClick={onSelectColor ? () => onSelectColor('verde') : undefined}
        selected={selectedColor === 'verde'}
      />
      <TrendStatCard
        icon={<TrafficLight color="yellow" />}
        title="POTENCIAL"
        value={formatNumber(colorStats.amarillo)}
        onClick={onSelectColor ? () => onSelectColor('amarillo') : undefined}
        selected={selectedColor === 'amarillo'}
      />
      <TrendStatCard
        icon={<TrafficLight color="red" />}
        title="EXPLORACIÓN"
        value={formatNumber(colorStats.rojo)}
        onClick={onSelectColor ? () => onSelectColor('rojo') : undefined}
        selected={selectedColor === 'rojo'}
      />
      <TrendStatCard
        icon={<TrafficLight color="gray" />}
        title="SIN CLASIFICAR"
        value={formatNumber(colorStats.sin_clasificar)}
        onClick={onSelectColor ? () => onSelectColor('sin_clasificar') : undefined}
        selected={selectedColor === 'sin_clasificar'}
      />
    </div>
  );
};

export default StatsCards;
