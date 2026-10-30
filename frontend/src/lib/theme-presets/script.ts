import { buildPayload, parseSelection } from "./selection"

/** Where the selected preset (and its prepared CSS) is persisted. */
export const THEME_PRESET_STORAGE_KEY = "theme-preset"

/**
 * Aplica el preset guardado (o el default de la app si no hay nada guardado)
 * antes de que React monte — si no, la app flashea el tema base en cada reload.
 *
 * El payload se reconstruye desde la selección (no se confía en el CSS
 * guardado) para que la migración de payloads viejos y el default nuevo pinten
 * desde la primera pintura.
 *
 * En base esto es un string inline en el `<head>` (Next); acá corre como
 * función llamada desde `main.tsx` antes de `createRoot(...).render(...)`.
 */
export function bootstrapThemePreset(): void {
  try {
    const raw = localStorage.getItem(THEME_PRESET_STORAGE_KEY) ?? ""
    const payload = buildPayload(parseSelection(raw))

    for (const url of payload.fontUrls) {
      const link = document.createElement("link")
      link.rel = "stylesheet"
      link.href = url
      link.setAttribute("data-theme-preset", "font")
      document.head.appendChild(link)
    }

    if (payload.css) {
      const style = document.createElement("style")
      style.setAttribute("data-theme-preset", "tokens")
      style.textContent = payload.css
      document.head.appendChild(style)
    }
  } catch {
    /* localStorage bloqueado o payload corrupto: se arranca con el default. */
  }
}
