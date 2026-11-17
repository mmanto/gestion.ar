import { Navigate, useParams } from 'react-router-dom';
import { useTemplate } from '../hooks/useTemplate';
import UrbanVoicePartners from '../templates/urbanvoice/partners/UrbanVoicePartners';

/**
 * Partners sólo existe en el tema UrbanVoice: es parte de la réplica de la
 * administración de la demo. En los demás temas la URL vuelve al escritorio.
 */
export function PartnersRoute() {
  const { templateId } = useTemplate();
  const { partnerId } = useParams();

  if (templateId === 'urbanvoice') return <UrbanVoicePartners />;
  if (partnerId) return <Navigate to="/partners" replace />;
  return <Navigate to="/dashboard" replace />;
}
