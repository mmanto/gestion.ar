import type { CapacitorConfig } from '@capacitor/cli'

const target = process.env.VITE_TARGET || 'staff'

const baseConfig: CapacitorConfig = {
  webDir: `dist-${target}`,
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#2793b4',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#2793b4',
    },
  },
}

const staffConfig: CapacitorConfig = {
  ...baseConfig,
  appId: 'ar.gestion.staff',
  appName: 'gestion.ar Staff',
}

const clientConfig: CapacitorConfig = {
  ...baseConfig,
  appId: 'ar.gestion.client',
  appName: 'gestion.ar',
}

const config: CapacitorConfig = target === 'client' ? clientConfig : staffConfig

export default config
