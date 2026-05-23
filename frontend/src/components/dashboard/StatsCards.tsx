import { MessageSquare, MessagesSquare, Cpu, DollarSign } from 'lucide-react';
import { Card } from '../common/Card';
import { formatNumber, formatCurrency } from '../../utils/formatters';
import type { ConversationStats } from '../../types/conversation.types';

interface StatsCardsProps {
  stats: ConversationStats;
}

const StatsCards = ({ stats }: StatsCardsProps) => {
  const cards = [
    {
      title: 'Total Conversaciones',
      value: formatNumber(stats.total_conversations),
      icon: MessageSquare,
      color: 'text-primary',
      bgColor: 'bg-primary-50',
    },
    {
      title: 'Total Mensajes',
      value: formatNumber(stats.total_messages),
      icon: MessagesSquare,
      color: 'text-secondary',
      bgColor: 'bg-secondary-50',
    },
    {
      title: 'Tokens Usados',
      value: formatNumber(stats.total_tokens_used),
      icon: Cpu,
      color: 'text-accent',
      bgColor: 'bg-purple-50',
    },
    {
      title: 'Costo Total',
      value: formatCurrency(stats.total_cost_usd),
      icon: DollarSign,
      color: 'text-pink-600',
      bgColor: 'bg-pink-50',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.title} className="hover:shadow-lg transition-shadow duration-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{card.title}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{card.value}</p>
              </div>
              <div className={`p-3 rounded-lg ${card.bgColor}`}>
                <Icon className={`w-6 h-6 ${card.color}`} />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
};

export default StatsCards;
