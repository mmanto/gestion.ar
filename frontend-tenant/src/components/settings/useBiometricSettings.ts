import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { biometricService, isNative, type DeviceInfo } from '../../services/biometric.service';

// Códigos de BiometricManager.canAuthenticate — diagnóstico cuando la app
// reporta "sin huella" pero el usuario sí tiene una (ver BiometricAuthPlugin).
export const REASON_LABELS: Record<number, string> = {
  1: 'hardware de biometría no disponible temporalmente (1)',
  11: 'sin biometría fuerte enrollada en el sistema (11)',
  12: 'el dispositivo no tiene sensor de biometría fuerte (12)',
  13: 'biometría no soportada por este dispositivo (13)',
};

function biometricError(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const { message } = err;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

/**
 * Estado y acciones de Ajustes › Acceso con huella. La presentación del tema
 * UrbanVoice y la del backoffice clásico comparten este hook.
 */
export function useBiometricSettings() {
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
      setError(biometricError(err, 'No se pudo habilitar el acceso con huella'));
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
      setError(biometricError(err, 'No se pudo deshabilitar el acceso con huella'));
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
      setError(biometricError(err, 'No se pudo revocar el dispositivo'));
    }
  };

  return {
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
  };
}
