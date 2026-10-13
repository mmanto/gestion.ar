/** Where the selected preset (and its prepared CSS) is persisted. */
export const THEME_PRESET_STORAGE_KEY = "theme-preset"

/**
 * Re-applies the stored preset before React mounts — otherwise the app flashes
 * the base theme on every reload. Must stay in sync with the payload
 * `components/theme-preset-provider.tsx` writes.
 *
 * En base esto es un string inline en el `<head>` (Next); acá corre como
 * función llamada desde `main.tsx` antes de `createRoot(...).render(...)`.
 */
export function bootstrapThemePreset(): void {
  try {
    const raw = localStorage.getItem(THEME_PRESET_STORAGE_KEY)
    if (!raw) return
    const preset = JSON.parse(raw) as
      | { fontUrls?: string[]; css?: string }
      | null
    if (!preset || typeof preset !== "object") return

    for (const url of preset.fontUrls ?? []) {
      const link = document.createElement("link")
      link.rel = "stylesheet"
      link.href = url
      link.setAttribute("data-theme-preset", "font")
      document.head.appendChild(link)
    }

    if (preset.css) {
      const style = document.createElement("style")
      style.setAttribute("data-theme-preset", "tokens")
      style.textContent = preset.css
      document.head.appendChild(style)
    }
  } catch {
    /* localStorage bloqueado o payload corrupto: se arranca con el tema base. */
  }
}
