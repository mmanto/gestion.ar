import * as React from "react"
import {
  ThemeContext,
  type ThemeContextValue,
} from "../context/ThemeContext"

/**
 * Acceso al esquema de color activo (`theme`/`resolvedTheme`/`setTheme`). Vive
 * fuera del provider para que ese archivo exporte sólo componentes, igual que
 * `hooks/useAuth.ts` respecto de `context/AuthContext.tsx`.
 */
export function useTheme(): ThemeContextValue {
  const context = React.useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme debe usarse dentro de ThemeProvider")
  }

  return context
}
