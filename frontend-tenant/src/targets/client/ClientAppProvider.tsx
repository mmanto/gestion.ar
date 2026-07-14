import type { ReactNode } from 'react'
import { useClientPushNotifications } from '../../hooks/useClientPush'

interface ClientAppProviderProps {
  children: ReactNode
  botId: string | null
  channelId: string | null
  clientId: string | null
}

/**
 * Wrapper que inicializa servicios nativos para la app cliente:
 * - Push notifications nativas (FCM/APNs) para recibir mensajes del bot/agente
 * - En PWA web, las notificaciones se manejan vía VAPID + service worker
 */
export function ClientAppProvider({ children, botId, channelId, clientId }: ClientAppProviderProps) {
  useClientPushNotifications({ botId, channelId, clientId })
  return <>{children}</>
}
