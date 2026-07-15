import { useTemplate } from './useTemplate';
import { ACCENT_THEME } from '../styles/accentTheme';
import type { AccentTheme } from '../styles/accentTheme';

/**
 * Devuelve el acento de color (botón primario, focus ring) del template activo
 */
export const useAccentTheme = (): AccentTheme => {
  const { templateId } = useTemplate();
  return ACCENT_THEME[templateId];
};
