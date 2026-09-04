import { useTenant } from '../../hooks/useTenant';
import { resolveAssetUrl } from '../../utils/assetUrl';

const FALLBACK_COLOR = '#25357a';
const FALLBACK_LOGO = '/img/logo_vertical_ius.svg';

interface ChatHeaderProps {
  isConnected: boolean;
}

export function ChatHeader({ isConnected }: ChatHeaderProps) {
  const { tenant } = useTenant();
  const primaryColor = tenant?.branding.primary_color || FALLBACK_COLOR;
  const logo = resolveAssetUrl(
    tenant?.branding.logo_url_vertical || tenant?.branding.logo_url
  );
  const tenantName = tenant?.name || 'Asistente';

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 text-white shadow-md"
      style={{ backgroundColor: primaryColor }}
    >
      {/* El badge es circular. La imagen llena el disco completo (w-9 h-9):
          sin object-cover el navegador la estira al tamaño del slot y las
          esquinas de un rectángulo sobresaldrían del círculo; rounded-full +
          object-cover la recortan en círculo desde el centro. El bg-white del
          contenedor solo queda visible detrás de logos con transparencia;
          para imágenes opacas (foto-avatar) no se ve ningún borde. */}
      <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0 overflow-hidden">
        <img src={logo || FALLBACK_LOGO} alt={tenantName} className="w-9 h-9 rounded-full object-cover" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">{tenantName}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}
          />
          <span className="text-xs text-white/75">
            {isConnected ? 'Conectado' : 'Desconectado'}
          </span>
        </div>
      </div>
    </div>
  );
}
