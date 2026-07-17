import { Capacitor } from '@capacitor/core';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';

// En nativo, el JWT y el usuario logueado se guardan en el Keystore (Android)
// vía este plugin en vez de localStorage — localStorage de una WebView es
// legible desde el propio dispositivo (ej. vía `chrome://inspect` con USB
// debugging), mientras que el Keystore está cifrado a nivel de SO. En web
// se sigue usando localStorage tal cual (comportamiento sin cambios).
const isNative = Capacitor.isNativePlatform();

async function getItem(key: string): Promise<string | null> {
  if (!isNative) return localStorage.getItem(key);
  try {
    const { value } = await SecureStoragePlugin.get({ key });
    return value;
  } catch {
    // El plugin rechaza la promesa si la key no existe
    return null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  if (!isNative) {
    localStorage.setItem(key, value);
    return;
  }
  await SecureStoragePlugin.set({ key, value });
}

async function removeItem(key: string): Promise<void> {
  if (!isNative) {
    localStorage.removeItem(key);
    return;
  }
  try {
    await SecureStoragePlugin.remove({ key });
  } catch {
    // Ya no existía — no es un error real
  }
}

export const tokenStorage = { getItem, setItem, removeItem };
