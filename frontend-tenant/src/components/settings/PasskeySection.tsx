import { useCallback, useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Alert } from '../common/Alert';
import {
  enrollPasskey,
  isPasskeySupported,
  listPasskeys,
  revokePasskey,
  PasskeyCancelled,
  type PasskeyInfo,
} from '../../services/passkey.service';

/**
 * Mensaje a mostrar: los errores de passkey.service ya vienen traducidos al
 * español (con el `detail` del backend si existía), así que alcanza con el
 * mensaje del Error y, si no es un Error, el fallback.
 */
function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * "Passkeys" — gestión del ingreso con Face ID, huella, Windows Hello o llave
 * de seguridad (WebAuthn).
 *
 * A diferencia del acceso con huella (BiometricSection), acá no hay guard por
 * plataforma: WebAuthn es web-first y lo que decide es el soporte del navegador
 * (ver isPasskeySupported). Arriba se registra una passkey nueva para la cuenta
 * actual; abajo se listan las registradas para revocar las que ya no se usan.
 */
export const PasskeySection = () => {
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
      setError(errorMessage(err, 'No se pudieron cargar tus passkeys'));
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
        setError(errorMessage(err, 'No se pudo agregar la passkey'));
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
      setError(errorMessage(err, 'No se pudo revocar la passkey'));
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <Card className="md:col-span-3" shadow="sm">
      <div className="flex items-center gap-3 mb-3">
        <KeyRound className="w-5 h-5 text-gray-500" />
        <h2 className="text-xl font-semibold text-gray-900">Passkeys</h2>
      </div>

      <p className="text-sm text-gray-700 mb-4">
        Ingresá con Face ID, huella, Windows Hello o una llave de seguridad.
      </p>

      {!supported ? (
        <p className="text-sm text-gray-700">
          Este navegador no soporta passkeys. Probá con uno actualizado, o desde la app en el
          celular.
        </p>
      ) : (
        <div className="space-y-4">
          {error && <Alert variant="error">{error}</Alert>}
          {hint && <p className="text-xs text-gray-500 leading-relaxed">{hint}</p>}

          <div className="flex flex-col sm:flex-row sm:items-end gap-2">
            <label className="flex-1">
              <span className="block text-xs font-medium text-gray-700 mb-1">Nombre (opcional)</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Notebook del estudio"
                disabled={busy}
                className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 outline-none transition-colors focus:border-[#2563eb] disabled:opacity-50"
              />
            </label>
            <Button size="sm" onClick={handleAdd} loading={busy}>
              Agregar passkey
            </Button>
          </div>

          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-medium text-gray-700 mb-2">Passkeys registradas</p>
            {loading ? (
              <p className="text-sm text-gray-500">Cargando…</p>
            ) : passkeys.length === 0 ? (
              <p className="text-sm text-gray-500">
                Todavía no registraste ninguna passkey. Agregá una para entrar sin escribir tu
                contraseña.
              </p>
            ) : (
              <ul className="space-y-2">
                {passkeys.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 text-sm text-gray-700"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <KeyRound className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="truncate">{p.name || 'Passkey'}</span>
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRevoke(p.id)}
                      loading={revokingId === p.id}
                    >
                      Revocar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};
