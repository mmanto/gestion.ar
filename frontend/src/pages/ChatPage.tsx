import { useParams } from 'react-router-dom';
import { ChatInterface } from '../components/chat/ChatInterface';
import { InstallButton } from '../components/chat/InstallButton';
// import { PushNotificationButton } from '../components/chat/PushNotificationButton'; // deshabilitado — ver ADR-015
import { usePwaManifest } from '../hooks/usePwaManifest';

export function ChatPage() {
  const { botId, channelId } = useParams<{ botId?: string; channelId?: string }>();
  usePwaManifest(channelId);

  if (!botId && !channelId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 text-gray-700">
        Chat no encontrado
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <ChatInterface botId={botId} channelId={channelId} />

      {/* PWA: instalar y push notifications (solo para chat por canal) */}
      {channelId && (
        <>
          <InstallButton />
          {/* PushNotificationButton deshabilitado globalmente (2026-08-21).
              Pedido original: quitarlo solo para el tenant pachoteayuda.
              Solución elegida: deshabilitar globalmente (Opción B) hasta implementar
              control por canal/tenant (ver docs/dev/DECISIONS.md ADR-015).
              Para re-habilitarlo de forma granular, ver ADR-015. */}
          {/* <PushNotificationButton channelId={channelId} botId={botId} /> */}
        </>
      )}
    </div>
  );
}
