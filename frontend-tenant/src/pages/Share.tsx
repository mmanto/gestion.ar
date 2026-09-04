import { useEffect, useState } from 'react';
import { Share2 } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { PageHeader } from '../components/common/PageHeader';
import { Alert } from '../components/common/Alert';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { useAuth } from '../hooks/useAuth';
import botsService from '../services/bots.service';
import myChannelService from '../services/myChannel.service';
import { publicService } from '../services/public.service';

/**
 * Compartir — el staff comparte sus datos (y su link de chat web propio) con
 * un cliente por WhatsApp. Arma un mensaje con wa.me y lo abre.
 */
export const Share = () => {
  const { user } = useAuth();

  // El link de chat del abogado es su canal web propio (ver Settings "Mi link
  // de chat"): `publicUrl/chat/c/{channel_id}` del primer bot activo del tenant.
  const [chatLink, setChatLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    botsService
      .getBots({ limit: 1 })
      .then(async (r) => {
        if (r.bots.length === 0) return;
        const botId = r.bots[0].bot_id;
        const [channel, publicUrl] = await Promise.all([
          myChannelService.getMyChannel(botId),
          publicService.getPublicUrl(),
        ]);
        if (channel?.channel_id && !cancelled) {
          setChatLink(`${publicUrl}/chat/c/${channel.channel_id}`);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error cargando tu link de chat');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fullName = [user?.nombre, user?.apellido].filter(Boolean).join(' ') || user?.username || '';

  const messageLines = (): string[] =>
    [
      `Hola, soy ${fullName}`.trim(),
      user?.email ? `Mi correo: ${user.email}` : null,
      'Podés escribirme directamente desde este enlace:',
      chatLink,
    ]
      .filter(Boolean)
      .map(String);

  const buildMessage = (): string => messageLines().join('\n');

  const phoneDigits = phone.replace(/\D/g, '');

  const handleSend = () => {
    if (!phoneDigits || !chatLink) return;
    window.open(
      `https://wa.me/${phoneDigits}?text=${encodeURIComponent(buildMessage())}`,
      '_blank',
      'noopener,noreferrer'
    );
    setSentTo(phoneDigits);
  };

  return (
    <AppLayout>
      <div className="font-editorial p-1 md:bg-[#F8F9FD] md:p-8">
        <PageHeader
          title="Compartir"
          description="Enviá tus datos y tu link de chat por WhatsApp"
          titleClassName="font-semibold uppercase tracking-[0.08em]"
          descriptionClassName="text-gray-800"
        />

        {error && <Alert variant="error" className="mb-6">{error}</Alert>}

        <Card shadow="none" className="max-w-xl">
          {loading ? (
            <p className="text-sm text-gray-700">Cargando tu link de chat...</p>
          ) : !chatLink ? (
            <p className="text-sm text-gray-700">
              No hay un bot configurado todavía — no se puede compartir tu chat.
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              <div>
                <label
                  htmlFor="compartir-whatsapp"
                  className="block text-xs font-medium text-gray-700 mb-1.5"
                >
                  Número de WhatsApp del cliente
                </label>
                <input
                  id="compartir-whatsapp"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setSentTo(null);
                  }}
                  placeholder="Ej. 5491100000000 (con código de país)"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <Button variant="primary" size="lg" fullWidth onClick={handleSend} disabled={!phoneDigits}>
                <Share2 className="w-4 h-4 mr-2" />
                Enviar por WhatsApp
              </Button>

              {sentTo && (
                <p className="text-sm text-gray-600">
                  Se abrió WhatsApp para enviar tu presentación al número {sentTo}. Completá el
                  envío desde la app.
                </p>
              )}

              <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                <p className="text-xs font-medium text-gray-700 mb-1.5">Vista previa del mensaje</p>
                <div className="text-sm text-gray-800">
                  {messageLines().map((line, i) =>
                    line === chatLink && chatLink ? (
                      <a
                        key={i}
                        href={chatLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block mb-1 text-blue-600 underline break-all"
                      >
                        {chatLink}
                      </a>
                    ) : (
                      <div key={i} className="mb-1">{line}</div>
                    )
                  )}
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  En WhatsApp el enlace llega como link clickeable — el cliente solo tiene que
                  tocarlo para abrir tu chat.
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
};

export default Share;
