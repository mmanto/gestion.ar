import { useParams } from 'react-router-dom';
import { AppLayout } from '../../../components/layout/AppLayout';
import ClientsList from './ClientsList';
import ClientDetail from './ClientDetail';

/** Contenido de Clientes del tema UrbanVoice: listado o ficha según la URL. */
export default function UrbanVoiceClients() {
  const { clientId } = useParams();
  return <AppLayout>{clientId ? <ClientDetail clientId={clientId} /> : <ClientsList />}</AppLayout>;
}
