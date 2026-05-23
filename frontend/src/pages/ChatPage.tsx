import { useParams } from 'react-router-dom';
import { ChatInterface } from '../components/chat/ChatInterface';
import { InstallButton } from '../components/chat/InstallButton';
import { PushNotificationButton } from '../components/chat/PushNotificationButton';
import { InstallPrompt } from '../components/pwa/InstallPrompt';
import { usePwaManifest } from '../hooks/usePwaManifest';

export function ChatPage() {
  const { botId, channelId } = useParams<{ botId?: string; channelId?: string }>();
  usePwaManifest(channelId);

  if (!botId && !channelId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 text-gray-500">
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
          <InstallPrompt ignoreDismiss />
          <InstallButton />
          <PushNotificationButton channelId={channelId} botId={botId} />
        </>
      )}
    </div>
  );
}
