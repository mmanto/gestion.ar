import { useParams } from 'react-router-dom';
import { AppLayout } from '../../../components/layout/AppLayout';
import PartnersList from './PartnersList';
import PartnerDetail from './PartnerDetail';

/** Contenido de Partners del tema UrbanVoice: listado o ficha según la URL. */
export default function UrbanVoicePartners() {
  const { partnerId } = useParams();
  return <AppLayout>{partnerId ? <PartnerDetail partnerId={partnerId} /> : <PartnersList />}</AppLayout>;
}
