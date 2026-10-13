/** Qué eligió el usuario. `system` sigue la preferencia del sistema operativo. */
export type ThemeSetting = "system" | "light" | "dark"

/** Lo que se aplica de verdad en el documento. */
export type ResolvedTheme = "light" | "dark"

/** Clave de `localStorage` donde se recuerda la elección. */
export const THEME_STORAGE_KEY = "gestionar-theme"

const MEDIA_QUERY = "(prefers-color-scheme: dark)"

export function readStoredTheme(): ThemeSetting {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (raw === "light" || raw === "dark" || raw === "system") return raw
  } catch {
    // Storage bloqueado (modo privado, cookies bloqueadas): se usa el sistema.
  }
  return "system"
}

export function systemTheme(): ResolvedTheme {
  return window.matchMedia(MEDIA_QUERY).matches ? "dark" : "light"
}

/** Traduce la elección a `light`/`dark` resolviendo `system` con `matchMedia`. */
export function resolveTheme(setting: ThemeSetting): ResolvedTheme {
  return setting === "system" ? systemTheme() : setting
}

/** Aplica la clase `.dark` y `color-scheme` en `<html>`. */
export function applyThemeClass(resolved: ResolvedTheme) {
  const root = document.documentElement
  root.classList.toggle("dark", resolved === "dark")
  root.style.colorScheme = resolved
}

/**
 * Aplica el esquema persistido antes de montar React, para que el primer paint
 * ya salga en oscuro (evita el flash blanco). Sin listeners.
 */
export function bootstrapColorScheme() {
  applyThemeClass(resolveTheme(readStoredTheme()))
}
