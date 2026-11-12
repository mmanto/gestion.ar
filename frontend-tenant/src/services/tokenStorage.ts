import { Capacitor } from '@capacitor/core';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';
import { getTenantStorageScope, scopedStorageKey } from './tenantStorageScope';

// En nativo, el JWT y el usuario logueado se guardan en el Keystore (Android)
// vía este plugin en vez de localStorage — localStorage de una WebView es
// legible desde el propio dispositivo (ej. vía `chrome://inspect` con USB
// debugging), mientras que el Keystore está cifrado a nivel de SO. En web
// se sigue usando localStorage tal cual (comportamiento sin cambios).
const isNative = Capacitor.isNativePlatform();

async function readRaw(key: string): Promise<string | null> {
  if (!isNative) return localStorage.getItem(key);
  try {
    const { value } = await SecureStoragePlugin.get({ key });
    return value;
  } catch {
    // El plugin rechaza la promesa si la key no existe
    return null;
  }
}

async function writeRaw(key: string, value: string): Promise<void> {
  if (!isNative) {
    localStorage.setItem(key, value);
    return;
  }
  await SecureStoragePlugin.set({ key, value });
}

async function removeRaw(key: string): Promise<void> {
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

async function getItem(key: string): Promise<string | null> {
  const scopedKey = scopedStorageKey(key);
  const value = await readRaw(scopedKey);
  if (value !== null || getTenantStorageScope() === null) return value;

  // Migración: la sesión se abrió antes de que el tenant tuviera nombre interno
  // (key sin prefijo). Se copia a la key scopeada y se borra la legacy, para que
  // no quede utilizable desde la URL de otro tenant.
  const legacy = await readRaw(key);
  if (legacy !== null) {
    await writeRaw(scopedKey, legacy);
    await removeRaw(key);
  }
  return legacy;
}

async function setItem(key: string, value: string): Promise<void> {
  await writeRaw(scopedStorageKey(key), value);
}

async function removeItem(key: string): Promise<void> {
  await removeRaw(scopedStorageKey(key));
  // La legacy también se limpia: puede venir de una sesión previa a la URL interna.
  await removeRaw(key);
}

export const tokenStorage = { getItem, setItem, removeItem };
