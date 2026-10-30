import { useEffect, useState } from 'react';
import axios from 'axios';
import tenantAdminService from '../../services/tenantAdmin.service';

interface TenantApiKeyCardProps {
  tenantId: string;
}

const primaryButton =
  'px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50';
const secondaryButton =
  'px-3 py-1.5 text-sm border border-gray-300 text-gray-900 rounded-lg hover:bg-gray-50 disabled:opacity-50';

/**
 * API key del tenant (`tk_live_…`) que autentica a los clientes de voz
 * (APK/PWA) en `/api/public/voice/*`.
 *
 * Vive en el tenant, no en el canal, pero se muestra acá porque es lo que el
 * canal de voz necesita para que un cliente se conecte. El backend sólo
 * devuelve la key en claro al emitirla: después queda guardado su SHA-256.
 */
export const TenantApiKeyCard = ({ tenantId }: TenantApiKeyCardProps) => {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingRotate, setConfirmingRotate] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHasKey(null);
    setApiKey(null);
    setError(null);

    tenantAdminService
      .getTenantApiKeyStatus(tenantId)
      .then((value) => {
        if (!cancelled) setHasKey(value);
      })
      .catch(() => {
        if (!cancelled) setError('No se pudo leer el estado de la API key');
      });

    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const issue = async (rotate: boolean) => {
    setBusy(true);
    setError(null);
    setCopied(false);

    try {
      const key = await tenantAdminService.issueTenantApiKey(tenantId, rotate);
      setApiKey(key);
      setHasKey(true);
      setConfirmingRotate(false);
    } catch (err) {
      const alreadyIssued = axios.isAxiosError(err) && err.response?.status === 409;
      setError(
        alreadyIssued
          ? 'El tenant ya tiene una API key: usá Rotar para reemplazarla'
          : rotate
            ? 'No se pudo rotar la API key'
            : 'No se pudo generar la API key'
      );
      // 409: ya existía una key (por ejemplo, emitida desde la API).
      tenantAdminService
        .getTenantApiKeyStatus(tenantId)
        .then(setHasKey)
        .catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('No se pudo copiar: seleccioná la key y copiala a mano');
    }
  };

  return (
    <div className="border-t border-gray-200 pt-4">
      <p className="text-sm font-medium text-gray-900 mb-1">API key del tenant</p>
      <p className="text-sm text-gray-600 mb-3">
        El APK o la PWA de voz autentican con esta key
        (<code className="font-mono text-xs">Authorization: Bearer tk_live_…</code>).
        Es del tenant, no del canal: sirve para todos sus canales de voz.
      </p>

      {apiKey ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <code className="block font-mono text-xs text-gray-900 break-all select-all">
            {apiKey}
          </code>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button type="button" onClick={copy} className={secondaryButton}>
              {copied ? 'Copiado' : 'Copiar'}
            </button>
            <span className="text-xs text-amber-700">
              Guardala ahora: no se vuelve a mostrar.
            </span>
          </div>
        </div>
      ) : hasKey === null ? (
        <p className="text-sm text-gray-500">Cargando estado…</p>
      ) : hasKey ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="px-3 py-1 text-xs font-medium rounded-full bg-green-200 text-green-950">
            Emitida
          </span>
          {confirmingRotate ? (
            <>
              <button
                type="button"
                onClick={() => issue(true)}
                disabled={busy}
                className={primaryButton}
              >
                {busy ? 'Rotando…' : 'Confirmar rotación'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingRotate(false)}
                disabled={busy}
                className={secondaryButton}
              >
                Cancelar
              </button>
              <span className="text-xs text-amber-700">
                La key actual deja de funcionar en los clientes conectados.
              </span>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingRotate(true)}
              disabled={busy}
              className={secondaryButton}
            >
              Rotar
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => issue(false)}
          disabled={busy}
          className={primaryButton}
        >
          {busy ? 'Generando…' : 'Generar API key'}
        </button>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
};

export default TenantApiKeyCard;
