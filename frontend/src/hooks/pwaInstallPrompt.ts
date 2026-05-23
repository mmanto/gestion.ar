/**
 * Módulo singleton para el evento beforeinstallprompt.
 *
 * El evento se captura en dos capas:
 *  1. index.html inline script (antes de que cualquier módulo ES cargue)
 *     → guardado en window.__pwaBeforeInstallPrompt
 *  2. main.tsx (listener de módulo, como respaldo)
 *     → guardado en _prompt
 *
 * getPwaInstallPrompt() lee ambas fuentes.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type WindowWithPwa = Window & { __pwaBeforeInstallPrompt?: BeforeInstallPromptEvent | null };

let _prompt: BeforeInstallPromptEvent | null = null;

export function setPwaInstallPrompt(e: Event) {
  _prompt = e as BeforeInstallPromptEvent;
}

export function getPwaInstallPrompt(): BeforeInstallPromptEvent | null {
  // Leer del módulo o del global capturado en index.html (lo que sea no-null)
  return _prompt ?? (window as WindowWithPwa).__pwaBeforeInstallPrompt ?? null;
}

export function clearPwaInstallPrompt() {
  _prompt = null;
  (window as WindowWithPwa).__pwaBeforeInstallPrompt = null;
}
