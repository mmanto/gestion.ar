import * as React from "react"
import {
  ThemePresetContext,
  type ThemePresetContextValue,
} from "../components/theme-preset-provider"

/**
 * Acceso al preset activo. Vive fuera del provider para que ese archivo exporte
 * sólo componentes (regla `react-refresh/only-export-components`), igual que
 * `hooks/useTemplate.ts` respecto de `context/TemplateContext.tsx`.
 */
export function useThemePreset(): ThemePresetContextValue {
  const context = React.useContext(ThemePresetContext)
  if (!context) {
    throw new Error("useThemePreset debe usarse dentro de un ThemePresetProvider")
  }

  return context
}
