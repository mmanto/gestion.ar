import ContactRequestsCard from './ContactRequestsCard';
import TrendStatCard from './TrendStatCard';
import { formatNumber, formatCurrency } from '../../utils/formatters';
import type { ConversationStats } from '../../types/conversation.types';

interface StatsCardsProps {
  stats: ConversationStats;
}

// TODO: variación semanal mock — /conversations/stats no expone todavía un
// punto de comparación histórico (semana actual vs. anterior) para estas
// métricas. Reemplazar por datos reales cuando el backend lo soporte.
const MOCK_MESSAGES_WEEKLY_CHANGE = 8;
const MOCK_TOKENS_WEEKLY_CHANGE = -5;
const MOCK_COST_WEEKLY_CHANGE = 3;

/** Punto de semáforo — código de color por nivel (alta viabilidad/potencial/exploración). */
const TrafficLight = ({ color }: { color: 'green' | 'yellow' | 'red' }) => {
  const bg = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-400',
    red: 'bg-red-500',
  }[color];
  return <span className={`w-5 h-5 rounded-full flex-shrink-0 ${bg}`} />;
};

const StatsCards = ({ stats }: StatsCardsProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <ContactRequestsCard />
      <TrendStatCard
        icon={<TrafficLight color="green" />}
        title="ALTA VIABILIDAD"
        value={formatNumber(stats.total_messages)}
        weeklyChange={MOCK_MESSAGES_WEEKLY_CHANGE}
      />
      <TrendStatCard
        icon={<TrafficLight color="yellow" />}
        title="POTENCIALES"
        value={formatNumber(stats.total_tokens_used)}
        weeklyChange={MOCK_TOKENS_WEEKLY_CHANGE}
      />
      <TrendStatCard
        icon={<TrafficLight color="red" />}
        title="EXPLORACIÓN"
        value={formatCurrency(stats.total_cost_usd)}
        weeklyChange={MOCK_COST_WEEKLY_CHANGE}
      />
    </div>
  );
};

export default StatsCards;
