import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../common/Card';
import { formatCurrency } from '../../utils/formatters';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ConversationStats, TimelineStats } from '../../types/conversation.types';

interface ChartsSectionProps {
  stats: ConversationStats;
  timeline: TimelineStats;
}

const COLORS = {
  whatsapp: '#25D366',
  telegram: '#0088cc',
  other: '#6b7280',
};

const ChartsSection = ({ stats, timeline }: ChartsSectionProps) => {
  // Datos para el pie chart de plataformas
  const platformData = Object.entries(stats.conversations_by_platform).map(([platform, count]) => ({
    name: platform.charAt(0).toUpperCase() + platform.slice(1),
    value: count,
    color: COLORS[platform as keyof typeof COLORS] || COLORS.other,
  }));

  // Datos para el área chart de costos acumulados
  const costData = timeline.timeline.reduce<{ date: string; costo: number }[]>((acc, stat) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].costo : 0;
    acc.push({
      date: format(parseISO(stat.date), 'dd/MM', { locale: es }),
      costo: parseFloat((prev + stat.cost).toFixed(6)),
    });
    return acc;
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
      {/* Pie Chart - Conversaciones por Plataforma */}
      <Card>
        <CardHeader>
          <CardTitle>Conversaciones por Plataforma</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={platformData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {platformData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Area Chart - Costos Acumulados */}
      <Card>
        <CardHeader>
          <CardTitle>Costos Acumulados (USD)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={costData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <defs>
                  <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#9D4EDD" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#C77DFF" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  stroke="#6b7280"
                  style={{ fontSize: '12px' }}
                />
                <YAxis
                  stroke="#6b7280"
                  style={{ fontSize: '12px' }}
                  tickFormatter={(value) => `$${value}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '8px 12px',
                  }}
                  formatter={(value: number | undefined) => [formatCurrency(value || 0), 'Costo']}
                />
                <Area
                  type="monotone"
                  dataKey="costo"
                  stroke="#9D4EDD"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#costGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ChartsSection;
