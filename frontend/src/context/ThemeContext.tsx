import * as React from "react"
import {
  THEME_STORAGE_KEY,
  applyThemeClass,
  readStoredTheme,
  systemTheme,
  type ResolvedTheme,
  type ThemeSetting,
} from "../lib/colorScheme"

export interface ThemeContextValue {
  theme: ThemeSetting
  resolvedTheme: ResolvedTheme
  setTheme: (theme: ThemeSetting) => void
}

/**
 * `ThemeContext` + `ThemeProvider`. El hook vive en `hooks/useTheme.ts` para que
 * este archivo exporte sólo componentes.
 */
// eslint-disable-next-line react-refresh/only-export-components
export const ThemeContext = React.createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<ThemeSetting>(readStoredTheme)
  const [preferred, setPreferred] = React.useState<ResolvedTheme>(systemTheme)

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => setPreferred(media.matches ? "dark" : "light")
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])

  const resolvedTheme = theme === "system" ? preferred : theme

  React.useEffect(() => {
    applyThemeClass(resolvedTheme)
  }, [resolvedTheme])

  const setTheme = React.useCallback((next: ThemeSetting) => {
    setThemeState(next)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Persistir es best-effort; el cambio igual se aplica en esta sesión.
    }
  }, [])

  // Atajo de base: `d` alterna claro/oscuro cuando no se está escribiendo.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
      if (event.key.toLowerCase() !== "d") return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return
      }
      setTheme(resolvedTheme === "dark" ? "light" : "dark")
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [resolvedTheme, setTheme])

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
