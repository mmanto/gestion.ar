import { useTemplate } from '../hooks/useTemplate';
import { Settings } from './Settings';
import UrbanVoiceSettings from '../templates/urbanvoice/settings/UrbanVoiceSettings';

/**
 * Despacha Ajustes según el tema del tenant. UrbanVoice tiene una pantalla
 * propia con su shell y su sistema de tarjetas; los demás temas siguen con la
 * pantalla genérica del producto (que también elige su AppLayout).
 */
export function SettingsRoute() {
  const { templateId } = useTemplate();

  if (templateId === 'urbanvoice') return <UrbanVoiceSettings />;
  return <Settings />;
}
