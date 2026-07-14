import { useEffect, useRef } from 'react'
import { PushNotifications } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'
import api from '../services/api'

interface UseClientPushOptions {
  botId: string | null
  channelId: string | null
  clientId: string | null
}

/**
 * Hook para registrar y manejar notificaciones push nativas en la app cliente.
 * Solo activo en Capacitor (no en PWA web — la PWA usa VAPID via sw.js).
 */
export function useClientPushNotifications({ botId, channelId, clientId }: UseClientPushOptions) {
  const registered = useRef(false)

  useEffect(() => {
    const platform = Capacitor.getPlatform()
    if (platform !== 'ios' && platform !== 'android') return
    if (registered.current) return
    if (!botId) return

    registered.current = true

    const setup = async () => {
      const permStatus = await PushNotifications.checkPermissions()
      if (permStatus.receive === 'prompt') {
        await PushNotifications.requestPermissions()
      }

      PushNotifications.addListener('registration', async (token) => {
        try {
          await api.post('/api/push/subscribe', {
            platform: platform === 'ios' ? 'apns' : 'fcm',
            bot_id: botId,
            channel_id: channelId,
            device_token: token.value,
            client_id: clientId,
          })
        } catch (err) {
          console.warn('[ClientPush] Error registrando token:', err)
        }
      })

      PushNotifications.addListener('registrationError', (err) => {
        console.error('[ClientPush] Error de registro:', err)
      })

      PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        const data = notification.notification.data as Record<string, string> | undefined
        const url = data?.url || '/'
        window.location.href = url
      })

      await PushNotifications.register()
    }

    setup().catch((err) => {
      console.error('[ClientPush] Setup falló:', err)
    })

    return () => {
      PushNotifications.removeAllListeners()
    }
  }, [botId, channelId, clientId])
}
