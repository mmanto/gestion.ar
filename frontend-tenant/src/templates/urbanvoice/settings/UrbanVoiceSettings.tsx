import { useAuth } from '../../../hooks/useAuth';
import { AppLayout } from '../../../components/layout/AppLayout';
import AccountBlock from './AccountBlock';
import SecurityBlock from './SecurityBlock';
import BrandingBlock from './BrandingBlock';
import AiProviderBlock from './AiProviderBlock';
import './settings.css';

/**
 * Ajustes del tenant con el shell y el lenguaje visual de UrbanVoice.
 *
 * Reemplaza la pantalla genérica del producto para este tema (ver
 * pages/SettingsRoute.tsx): mismos datos y acciones, distribuidos en dos
 * columnas —cuenta y acceso arriba, marca e IA a ancho completo— para no dejar
 * celdas vacías en pantallas anchas. El bloque de Marca permite salir a otro
 * tema y, en ese caso, la ruta vuelve a la pantalla genérica de ese tema.
 */
export default function UrbanVoiceSettings() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  return (
    <AppLayout>
      <div className="uv-set">
        <div className="vh">
          <div>
            <h1>Ajustes</h1>
            <p className="muted">Tu cuenta, la marca del panel y el acceso al asistente.</p>
          </div>
        </div>

        <div className="uv-set-grid">
          <AccountBlock />
          <SecurityBlock />

          {isAdmin ? (
            <div className="uv-set-span-2">
              <BrandingBlock />
            </div>
          ) : null}
          {isAdmin ? (
            <div className="uv-set-span-2">
              <AiProviderBlock />
            </div>
          ) : null}
        </div>
      </div>
    </AppLayout>
  );
}
