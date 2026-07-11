import { Phone, ArrowUp, ArrowDown } from 'lucide-react';
import { Card } from '../common/Card';
import { formatPercentage } from '../../utils/formatters';

interface ContactRequestsCardProps {
  /** % de clientes que solicitaron contacto */
  percentage: number;
  /** Variación de esa cifra respecto a la semana anterior (positiva, negativa o 0) */
  weeklyChange: number;
}

// TODO: valores mock — todavía no existe en el backend un concepto de
// "cliente que solicitó contacto" (ni en Client ni en /conversations/stats).
// Reemplazar por datos reales cuando se defina el criterio de negocio.
const MOCK_PERCENTAGE = 34;
const MOCK_WEEKLY_CHANGE = 12;

const ContactRequestsCard = ({
  percentage = MOCK_PERCENTAGE,
  weeklyChange = MOCK_WEEKLY_CHANGE,
}: Partial<ContactRequestsCardProps>) => {
  const trendColor =
    weeklyChange > 0 ? 'text-green-600' : weeklyChange < 0 ? 'text-red-600' : 'text-gray-500';

  return (
    <Card shadow="none">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Phone className="w-5 h-5 text-primary" />
          <p className="text-sm font-medium text-gray-800">Solicitan contacto</p>
        </div>

        <p className="text-2xl font-bold text-gray-900">{formatPercentage(percentage)}</p>

        <div className={`flex items-center gap-1.5 text-sm font-medium ${trendColor}`}>
          {weeklyChange === 0 ? (
            <span>Sin cambios</span>
          ) : (
            <>
              {weeklyChange > 0 ? (
                <ArrowUp className="w-4 h-4 flex-shrink-0" />
              ) : (
                <ArrowDown className="w-4 h-4 flex-shrink-0" />
              )}
              <span>{Math.abs(weeklyChange)} en la semana</span>
            </>
          )}
        </div>
      </div>
    </Card>
  );
};

export default ContactRequestsCard;
