import { useEffect, useRef } from 'react'
import { PushNotifications } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'
import api from '../services/api'

interface UseNativePushOptions {
  botId: string | null
  userId: string | null
}

/**
 * Hook para registrar y manejar notificaciones push nativas en la app staff.
 * Solo activo en Capacitor (no en PWA web).
 *
 * Flujo:
 * 1. Solicitar permiso de notificaciones
 * 2. Registrar con FCM/APNs vía Capacitor plugin
 * 3. Enviar device_token al backend (POST /api/push/subscribe)
 * 4. Manejar taps en notificaciones para navegar a la conversación
 */
export function useNativePushNotifications({ botId, userId }: UseNativePushOptions) {
  const registered = useRef(false)

  useEffect(() => {
    const platform = Capacitor.getPlatform()
    if (platform !== 'ios' && platform !== 'android') return
    if (registered.current) return
    if (!botId || !userId) return

    registered.current = true

    const setup = async () => {
      // Solicitar permiso
      const permStatus = await PushNotifications.checkPermissions()
      if (permStatus.receive === 'prompt') {
        await PushNotifications.requestPermissions()
      }

      // Registrar para recibir tokens
      PushNotifications.addListener('registration', async (token) => {
        try {
          await api.post('/api/push/subscribe', {
            platform: platform === 'ios' ? 'apns' : 'fcm',
            bot_id: botId,
            device_token: token.value,
            user_id: userId,
          })
        } catch (err) {
          console.warn('[NativePush] Error registrando token:', err)
        }
      })

      PushNotifications.addListener('registrationError', (err) => {
        console.error('[NativePush] Error de registro:', err)
      })

      // Manejar tap en notificación → abrir conversación
      PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        const data = notification.notification.data as Record<string, string> | undefined
        if (data?.conversation_id) {
          window.location.href = `/conversations/${data.conversation_id}`
        }
      })

      await PushNotifications.register()
    }

    setup().catch((err) => {
      console.error('[NativePush] Setup falló:', err)
    })

    return () => {
      PushNotifications.removeAllListeners()
    }
  }, [botId, userId])
}
