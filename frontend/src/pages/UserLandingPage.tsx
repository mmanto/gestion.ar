import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { publicService } from '../services/public.service';
import type { PublicUserInfo, PublicWebChannel, PublicBotWithChannels } from '../types/public.types';

function BotCard({ bot, isMobile, publicUrl }: { bot: PublicBotWithChannels; isMobile: boolean; publicUrl: string }) {
  const primaryChannel: PublicWebChannel | undefined = bot.web_channels[0];

  if (!primaryChannel) return null;

  return (
    <div className="bg-white rounded-2xl shadow-lg p-8 flex flex-col items-center gap-6 max-w-sm w-full">
      <div className="text-center">
        <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3v-3z" />
          </svg>
        </div>
        <p className="mt-1 text-sm text-gray-500">Asistente en comunicación</p>
      </div>

      {isMobile ? (
        <a
          href={`${publicUrl}/chat/c/${primaryChannel.channel_id}`}
          className="w-full py-3 px-6 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 active:scale-95 transition-all text-center"
        >
          Abrir chat
        </a>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <img
            src={publicService.getQrCodeUrl(primaryChannel.channel_id, publicUrl)}
            alt={`QR code para chatear con ${bot.name}`}
            className="w-48 h-48 rounded-lg border border-gray-100"
          />
          <p className="text-sm text-gray-500 text-center">
            Escanea el código con tu teléfono para chatear
          </p>
        </div>
      )}

      {bot.web_channels.length > 1 && (
        <div className="w-full border-t pt-4">
          <p className="text-xs text-gray-400 text-center mb-2">Otros canales</p>
          <div className="flex flex-col gap-2">
            {bot.web_channels.slice(1).map((ch) => (
              <a
                key={ch.channel_id}
                href={`${publicUrl}/chat/c/${ch.channel_id}`}
                className="text-sm text-indigo-600 hover:underline text-center"
              >
                {ch.name}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function UserLandingPage() {
  const { username } = useParams<{ username: string }>();
  const [userInfo, setUserInfo] = useState<PublicUserInfo | null>(null);
  const [publicUrl, setPublicUrl] = useState<string>(window.location.origin);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (!username) return;
    Promise.all([
      publicService.getUserInfo(username),
      publicService.getPublicUrl(),
    ])
      .then(([info, url]) => {
        setUserInfo(info);
        setPublicUrl(url);
      })
      .catch((err) => {
        if (err?.response?.status === 404) {
          setError('El usuario no existe.');
        } else {
          setError('No se pudo cargar la información.');
        }
      })
      .finally(() => setLoading(false));
  }, [username]);

  const activeBots = userInfo?.bots.filter((b) => b.web_channels.length > 0) ?? [];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-lg">{error}</p>
        </div>
      </div>
    );
  }

  if (activeBots.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-lg">No hay servicios disponibles en este momento.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white flex flex-col items-center justify-center p-6 gap-8">
      {activeBots.length > 1 && (
        <div className="text-center mb-2">
          <h1 className="text-2xl font-bold text-gray-800">{`Servicios de @${username}`}</h1>
        </div>
      )}

      {activeBots.length === 1 ? (
        <BotCard bot={activeBots[0]} isMobile={isMobile} publicUrl={publicUrl} />
      ) : (
        <div className="flex flex-wrap gap-6 justify-center">
          {activeBots.map((bot) => (
            <BotCard key={bot.bot_id} bot={bot} isMobile={isMobile} publicUrl={publicUrl} />
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-4">Powered by gestion.ar</p>
    </div>
  );
}
