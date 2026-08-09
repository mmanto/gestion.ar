import { Capacitor, registerPlugin } from '@capacitor/core';
import api from './api';
import { tokenStorage } from './tokenStorage';

/**
 * Puente TS hacia el plugin nativo `BiometricAuth` (BiometricAuthPlugin.java).
 *
 * El plugin expone el BiometricPrompt de Android y el Keystore: el `secret`
 * que habilita el login con huella vive cifrado en el dispositivo bajo una
 * clave `setUserAuthenticationRequired(true)`, así que `authenticate()` solo
 * lo desencripta (y lo devuelve a JS) después de validar la huella.
 */
interface BiometricAuthPlugin {
  isAvailable(): Promise<{ available: boolean; enrolled: boolean; reason?: number }>;
  authenticate(opts?: {
    promptTitle?: string;
    promptSubtitle?: string;
    negativeButtonText?: string;
  }): Promise<{ secret: string; deviceId: string }>;
  enroll(opts: { secret: string; deviceId: string }): Promise<void>;
  clear(): Promise<void>;
}

const BiometricAuth = registerPlugin<BiometricAuthPlugin>('BiometricAuth');

export const isNative = Capacitor.isNativePlatform();

export interface DeviceInfo {
  device_id: string;
  device_name: string | null;
  platform: string | null;
  created_at: string;
  last_used_at: string | null;
  current: boolean;
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export const biometricService = {
  isNative,

  /** ¿Hay biometría fuerte disponible y una credencial ya enrolada? */
  async isAvailable(): Promise<{ available: boolean; enrolled: boolean; reason?: number }> {
    if (!isNative) return { available: false, enrolled: false };
    try {
      return await BiometricAuth.isAvailable();
    } catch {
      return { available: false, enrolled: false };
    }
  },

  /**
   * Inscribe el dispositivo para login con huella. Requiere estar autenticado
   * (el JWT del usuario se usa para POST /auth/biometric/enroll).
   *
   * 1. Genera un secreto aleatorio (64 hex).
   * 2. Lo cifra en el Keystore bajo huella vía el plugin (prompt biométrico).
   * 3. Envía solo su hash SHA-256 al backend.
   */
  async enroll(deviceName?: string): Promise<{ deviceId: string }> {
    const secret = randomHex(32);
    const deviceId = crypto.randomUUID();
    await BiometricAuth.enroll({ secret, deviceId });
    const secretHash = await sha256Hex(secret);
    const { data } = await api.post('/auth/biometric/enroll', {
      device_id: deviceId,
      secret_hash: secretHash,
      device_name: deviceName || undefined,
      platform: 'android',
    });
    // Guardamos el deviceId local para poder revocar el dispositivo actual
    // sin tener que re-autenticar (ver BiometricSection.handleDisable).
    await tokenStorage.setItem('biometricDeviceId', deviceId);
    return { deviceId: data.device_id as string };
  },

  /** DeviceId del dispositivo actual, si hay una huella enrolada. */
  async getLocalDeviceId(): Promise<string | null> {
    return tokenStorage.getItem('biometricDeviceId');
  },

  /** Pide la huella y devuelve el secreto desbloqueado (solo tras validar). */
  async authenticate(): Promise<{ secret: string; deviceId: string }> {
    return BiometricAuth.authenticate();
  },

  /** Desactiva la huella: revoca en el backend (si se pasa deviceId) y limpia el Keystore local. */
  async disable(deviceId?: string): Promise<void> {
    if (deviceId) {
      await api.delete(`/auth/biometric/devices/${deviceId}`).catch(() => {
        // Si el dispositivo ya no existe en el backend, igual limpiamos local.
      });
    }
    try {
      await BiometricAuth.clear();
      await tokenStorage.removeItem('biometricDeviceId');
    } catch {
      // No hay credencial local — no es un error real.
    }
  },

  /** Dispositivos con huella habilitada del usuario actual (requiere JWT). */
  async listDevices(): Promise<DeviceInfo[]> {
    const { data } = await api.get<DeviceInfo[]>('/auth/biometric/devices');
    return data;
  },

  /** Revoca un dispositivo del usuario actual (requiere JWT). */
  async revoke(deviceId: string): Promise<void> {
    await api.delete(`/auth/biometric/devices/${deviceId}`);
  },
};
