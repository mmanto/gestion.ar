import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '../common/Card';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TimelineStats } from '../../types/conversation.types';

interface ActivityChartProps {
  timeline: TimelineStats;
}

const ActivityChart = ({ timeline }: ActivityChartProps) => {
  // Transformar los datos para Recharts
  const chartData = timeline.timeline.map((stat) => ({
    date: format(parseISO(stat.date), 'dd/MM', { locale: es }),
    fullDate: stat.date,
    mensajes: stat.messages,
    conversaciones: stat.conversations,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actividad de los últimos {timeline.days} días</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
              />
              <YAxis
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '8px 12px',
                }}
                labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
              />
              <Line
                type="monotone"
                dataKey="mensajes"
                stroke="#E41ECE"
                strokeWidth={2}
                dot={{ fill: '#E41ECE', r: 4 }}
                activeDot={{ r: 6 }}
                name="Mensajes"
              />
              <Line
                type="monotone"
                dataKey="conversaciones"
                stroke="#FF3BB5"
                strokeWidth={2}
                dot={{ fill: '#FF3BB5', r: 4 }}
                activeDot={{ r: 6 }}
                name="Conversaciones"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default ActivityChart;
