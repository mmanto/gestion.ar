import { useCallback, useEffect, useState } from 'react';
import {
  enrollPasskey,
  isPasskeySupported,
  listPasskeys,
  revokePasskey,
  PasskeyCancelled,
  type PasskeyInfo,
} from '../../services/passkey.service';

/**
 * Estado y acciones de Ajustes › Passkeys. La presentación del tema UrbanVoice
 * y la del backoffice clásico comparten este hook.
 */
export function usePasskeySettings() {
  const supported = isPasskeySupported();

  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Aviso (no error) cuando el dispositivo no creó la passkey: el caso típico es
  // que ya tenga una para este sitio — revocar acá borra el registro del
  // servidor, pero la copia del sistema sigue en el gestor de contraseñas y el
  // autenticador rechaza crear otra. El navegador no distingue eso de una
  // cancelación, así que se explica en vez de quedarse en silencio.
  const [hint, setHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPasskeys(await listPasskeys());
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : 'No se pudieron cargar tus passkeys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!supported) {
      setLoading(false);
      return;
    }
    void load();
  }, [load, supported]);

  const handleAdd = async () => {
    setError(null);
    setHint(null);
    setBusy(true);
    try {
      await enrollPasskey(name.trim() || undefined);
      setName('');
      await load();
    } catch (err: unknown) {
      if (err instanceof PasskeyCancelled) {
        setHint(
          'El dispositivo no creó la passkey. Si ya tiene una para este sitio, borrala primero ' +
            'del gestor de contraseñas del sistema (o del navegador) y volvé a intentar.',
        );
      } else {
        setError(err instanceof Error && err.message ? err.message : 'No se pudo agregar la passkey');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (credentialId: string) => {
    setError(null);
    setRevokingId(credentialId);
    try {
      await revokePasskey(credentialId);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : 'No se pudo revocar la passkey');
    } finally {
      setRevokingId(null);
    }
  };

  return {
    supported,
    passkeys,
    name,
    loading,
    busy,
    revokingId,
    error,
    hint,
    setName,
    handleAdd,
    handleRevoke,
  };
}
