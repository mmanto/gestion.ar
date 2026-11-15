import { Fingerprint, Smartphone } from 'lucide-react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Alert } from '../common/Alert';
import { REASON_LABELS, useBiometricSettings } from './useBiometricSettings';

/**
 * "Acceso con huella" — configuración del login biométrico (solo app nativa).
 *
 * El toggle habilita/deshabilita la huella en ESTE dispositivo:
 *  - Habilitar: genera un secreto, lo cifra bajo la huella en el Keystore
 *    (prompt nativo) y registra su hash en el backend.
 *  - Deshabilitar: limpia el Keystore local y revoca el registro en el backend.
 *
 * Abajo se listan los dispositivos con huella habilitada, para revocar
 * cualquier otro dispositivo (ej. un celular viejo) remotamente.
 */
export const BiometricSection = () => {
  const {
    isNative,
    available,
    enrolled,
    reason,
    devices,
    busy,
    error,
    handleEnable,
    handleDisable,
    handleRevoke,
  } = useBiometricSettings();

  if (!isNative) return null;

  return (
    <Card className="md:col-span-3" shadow="sm">
      <div className="flex items-center gap-3 mb-3">
        <Fingerprint className="w-5 h-5 text-gray-500" />
        <h2 className="text-xl font-semibold text-gray-900">Acceso con huella</h2>
      </div>

      {!available ? (
        <div>
          <p className="text-sm text-gray-700">
            Tu dispositivo no tiene una huella configurada. Activá una en los ajustes del teléfono para
            poder iniciar sesión con tu huella.
          </p>
          {reason !== undefined && (
            <p className="mt-1 text-xs text-gray-400">
              Diagnóstico: {REASON_LABELS[reason] ?? `código ${reason} de BiometricManager`}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {error && <Alert variant="error">{error}</Alert>}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-800">
                {enrolled ? 'Huella habilitada' : 'Habilitar acceso rápido'}
              </p>
              <p className="text-xs text-gray-500">
                {enrolled
                  ? 'Iniciá sesión en este dispositivo con tu huella'
                  : 'Entrá sin escribir tu usuario y contraseña cada vez'}
              </p>
            </div>
            {enrolled ? (
              <Button variant="danger" size="sm" onClick={handleDisable} loading={busy}>
                Deshabilitar
              </Button>
            ) : (
              <Button size="sm" onClick={handleEnable} loading={busy}>
                Habilitar
              </Button>
            )}
          </div>

          {devices.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-medium text-gray-700 mb-2">Dispositivos con acceso</p>
              <ul className="space-y-2">
                {devices.map((d) => (
                  <li
                    key={d.device_id}
                    className="flex items-center justify-between gap-3 text-sm text-gray-700"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Smartphone className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="truncate">{d.device_name || d.device_id.slice(0, 12)}</span>
                    </span>
                    <Button variant="outline" size="sm" onClick={() => handleRevoke(d.device_id)}>
                      Revocar
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};
