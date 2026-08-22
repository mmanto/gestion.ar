import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ChatInterface } from '../components/chat/ChatInterface';
import { InstallButton } from '../components/chat/InstallButton';
import { PushNotificationButton } from '../components/chat/PushNotificationButton';
import { usePwaManifest } from '../hooks/usePwaManifest';
import { publicService } from '../services/public.service';

export function ChatPage() {
  const { botId, channelId } = useParams<{ botId?: string; channelId?: string }>();
  usePwaManifest(channelId);

  // Bots con `blank_chat_on_load` (ver BotConfig): el chat arranca en blanco en
  // cada carga de página, con identidad de sesión nueva — así el flujo vuelve a
  // pedir los datos del paciente/ciudadano y queda un alta nueva. Se resuelve
  // ANTES de montar el chat para no flashear el historial de la sesión vieja;
  // si no se puede resolver (canal desconocido/error), se conserva el
  // comportamiento histórico (sesión persistida).
  const [blankOnLoad, setBlankOnLoad] = useState<boolean | null>(null);

  // Bots con `push_notifications_enabled = false` (ver BotConfig): el chat no
  // ofrece activar notificaciones push. Default: habilitadas (comportamiento
  // histórico). Si no se puede resolver, se conserva el comportamiento actual.
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!channelId) {
      setBlankOnLoad(false);
      setNotificationsEnabled(null);
      return;
    }
    publicService
      .getChannelInfo(channelId)
      .then((info) => {
        if (cancelled) return;
        setBlankOnLoad(!!info.bot?.blank_chat_on_load);
        setNotificationsEnabled(info.bot?.push_notifications_enabled !== false);
      })
      .catch(() => {
        if (cancelled) return;
        setBlankOnLoad(false);
        setNotificationsEnabled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  if (!botId && !channelId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 text-gray-700">
        Chat no encontrado
      </div>
    );
  }

  // Resolver blankOnLoad antes de montar el chat (evita flashear el historial
  // de una sesión anterior mientras llega el flag).
  if (channelId && blankOnLoad === null) {
    return <div className="min-h-screen bg-gray-100" />;
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <ChatInterface botId={botId} channelId={channelId} blankOnLoad={blankOnLoad ?? false} />

      {/* PWA: instalar y push notifications (solo para chat por canal, y solo
          si el bot habilita las notificaciones push) */}
      {channelId && notificationsEnabled !== false && (
        <>
          <InstallButton />
          <PushNotificationButton channelId={channelId} botId={botId} />
        </>
      )}
    </div>
  );
}