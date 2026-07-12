import { Phone } from 'lucide-react';
import TrendStatCard from './TrendStatCard';
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
}: Partial<ContactRequestsCardProps>) => (
  <TrendStatCard
    icon={Phone}
    title="SOLICITAN CONTACTO"
    value={formatPercentage(percentage)}
    weeklyChange={weeklyChange}
  />
);

export default ContactRequestsCard;
