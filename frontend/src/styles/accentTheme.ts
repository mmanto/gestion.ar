import type { TemplateId } from '../types/template.types';

export interface AccentTheme {
  accent: string;
  accentHover: string;
  /** Fondo tenue para hover de variantes outline/badges */
  accentSoft: string;
}

export const ACCENT_THEME: Record<TemplateId, AccentTheme> = {
  default: { accent: '#2A3B4D', accentHover: '#1E2C3A', accentSoft: 'rgba(42, 59, 77, 0.08)' },
  kero: { accent: '#DA624A', accentHover: '#C14F39', accentSoft: 'rgba(218, 98, 74, 0.08)' },
};
