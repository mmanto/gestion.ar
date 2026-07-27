import type { TemplateId } from '../types/template.types';

export interface AccentTheme {
  accent: string;
  accentHover: string;
  /** Fondo tenue para hover de variantes outline/badges */
  accentSoft: string;
}

// kero: blue-600/blue-700 de la paleta estándar de Tailwind (#2563eb /
// #1d4ed8) — antes un terracota ad-hoc (#DA624A), ver también
// templates/kero/tokens.ts (mismo acento, para los pocos casos que necesitan
// el hex directo en vez de una clase de Tailwind).
export const ACCENT_THEME: Record<TemplateId, AccentTheme> = {
  default: { accent: '#2A3B4D', accentHover: '#1E2C3A', accentSoft: 'rgba(42, 59, 77, 0.08)' },
  kero: { accent: '#2563EB', accentHover: '#1D4ED8', accentSoft: 'rgba(37, 99, 235, 0.08)' },
};
