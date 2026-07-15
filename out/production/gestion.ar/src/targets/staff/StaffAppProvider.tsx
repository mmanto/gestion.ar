import type { ReactNode } from 'react'
import { useNativePushNotifications } from '../../hooks/useNativePush'
import { useAuth } from '../../hooks/useAuth'

interface StaffAppProviderProps {
  children: ReactNode
  botId: string | null
}

/**
 * Wrapper que inicializa servicios nativos para la app staff:
 * - Push notifications (FCM/APNs)
 * - Más servicios en el futuro (deep links, status bar, etc.)
 */
export function StaffAppProvider({ children, botId }: StaffAppProviderProps) {
  const { user } = useAuth()

  useNativePushNotifications({
    botId,
    userId: user?.username ?? null,
  })

  return <>{children}</>
}
