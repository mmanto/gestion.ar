import { useCallback, useEffect, useState } from 'react';
import { Fingerprint, Smartphone } from 'lucide-react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Alert } from '../common/Alert';
import { useAuth } from '../../hooks/useAuth';
import { biometricService, isNative, type DeviceInfo } from '../../services/biometric.service';

// Códigos de BiometricManager.canAuthenticate — diagnóstico cuando la app
// reporta "sin huella" pero el usuario sí tiene una (ver BiometricAuthPlugin).
const REASON_LABELS: Record<number, string> = {
  1: 'hardware de biometría no disponible temporalmente (1)',
  11: 'sin biometría fuerte enrollada en el sistema (11)',
  12: 'el dispositivo no tiene sensor de biometría fuerte (12)',
  13: 'biometría no soportada por este dispositivo (13)',
};

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
  const { user } = useAuth();

  const [available, setAvailable] = useState<boolean>(false);
  const [enrolled, setEnrolled] = useState<boolean>(false);
  const [reason, setReason] = useState<number | undefined>(undefined);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const s = await biometricService.isAvailable();
    // Diagnóstico temporal del flujo de huella: ver qué respondió el plugin.
    console.log('[biometric] isAvailable ->', s);
    setAvailable(s.available);
    setEnrolled(s.enrolled);
    setReason(s.reason);
    if (s.enrolled) {
      biometricService.listDevices().then(setDevices).catch(() => setDevices([]));
    } else {
      setDevices([]);
    }
  }, []);

  useEffect(() => {
    if (!isNative) return;
    refresh();
  }, [refresh]);

  const fullName = [user?.nombre, user?.apellido].filter(Boolean).join(' ') || user?.username || '';

  const handleEnable = async () => {
    setError(null);
    setBusy(true);
    try {
      await biometricService.enroll(fullName || undefined);
      await refresh();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e?.message || 'No se pudo habilitar el acceso con huella');
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setError(null);
    setBusy(true);
    try {
      // Revoca el dispositivo actual usando el deviceId local persistido al
      // enrolar (evita tener que re-autenticar), y limpia el Keystore.
      const localDeviceId = await biometricService.getLocalDeviceId();
      await biometricService.disable(localDeviceId || undefined);
      await refresh();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e?.message || 'No se pudo deshabilitar el acceso con huella');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (deviceId: string) => {
    setError(null);
    try {
      await biometricService.revoke(deviceId);
      await refresh();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e?.message || 'No se pudo revocar el dispositivo');
    }
  };

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
