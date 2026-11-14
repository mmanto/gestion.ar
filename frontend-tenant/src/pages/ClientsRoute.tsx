import { Navigate, useParams } from 'react-router-dom';
import { useTemplate } from '../hooks/useTemplate';
import { Clients } from './Clients';
import UrbanVoiceClients from '../templates/urbanvoice/clients/UrbanVoiceClients';

/**
 * Despacha la pantalla Clientes según el tema del tenant. El tema UrbanVoice
 * trae su propia réplica (listado + ficha); los demás siguen con la pantalla
 * clásica. `/clients/:clientId` sólo tiene sentido en UrbanVoice: en el resto
 * se vuelve al listado para no dejar una URL con un parámetro ignorado.
 */
export function ClientsRoute() {
  const { templateId } = useTemplate();
  const { clientId } = useParams();

  if (templateId === 'urbanvoice') return <UrbanVoiceClients />;
  if (clientId) return <Navigate to="/clients" replace />;
  return <Clients />;
}
