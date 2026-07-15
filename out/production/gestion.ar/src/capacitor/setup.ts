import { Capacitor } from '@capacitor/core'
import { Keyboard, KeyboardStyle } from '@capacitor/keyboard'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'

/**
 * Inicialización mínima de Capacitor al arrancar la app nativa.
 * Configura status bar, safe areas via CSS, y oculta el splash screen.
 */
export async function initCapacitor(): Promise<void> {
  const platform = Capacitor.getPlatform()

  if (platform === 'ios') {
    await StatusBar.setStyle({ style: Style.Dark })
    await StatusBar.setBackgroundColor({ color: '#2793b4' })
  } else if (platform === 'android') {
    await StatusBar.setStyle({ style: Style.Dark })
    await StatusBar.setBackgroundColor({ color: '#2793b4' })
    await StatusBar.setOverlaysWebView({ overlay: false })
  }

  // Forzar modo oscuro del teclado en ambas plataformas
  if (platform === 'ios' || platform === 'android') {
    await Keyboard.setStyle({ style: KeyboardStyle.Dark })
  }

  // Ocultar splash screen después de la inicialización
  await SplashScreen.hide()
}
