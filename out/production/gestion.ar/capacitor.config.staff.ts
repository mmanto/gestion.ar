import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'ar.gestion.staff',
  appName: 'gestion.ar Staff',
  webDir: 'dist-staff',
  server: {
    // En desarrollo, androidScheme fuerza HTTP claro para localhost
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

export default config
