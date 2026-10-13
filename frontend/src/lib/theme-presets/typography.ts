/**
 * Steps of the heading size scale the user can pick in Apariencia.
 *
 * Each step is exactly one Tailwind size class, so a step renders like writing
 * that class: the size and the leading come in a pair, never mixed across
 * steps. The values are emitted as `--title-size`/`--title-leading` and every
 * heading in the app reads them through `heading-screen` (screen title) or
 * `heading-section` (sections, dialog and sheet titles).
 */
export type TitleSize = "sm" | "md" | "lg" | "xl" | "2xl"

/** `md` is what `:root` already declares, so it is stored as "no choice". */
export const DEFAULT_TITLE_SIZE: TitleSize = "md"

export const TITLE_SIZE_OPTIONS: readonly TitleSize[] = [
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
]

export const TITLE_SIZES: Record<
  TitleSize,
  { label: string; size: string; leading: string }
> = {
  sm: { label: "Chico", size: "1rem", leading: "1.5rem" },
  md: { label: "Medio", size: "1.125rem", leading: "1.75rem" },
  lg: { label: "Grande", size: "1.25rem", leading: "1.75rem" },
  xl: { label: "Más grande", size: "1.5rem", leading: "2rem" },
  "2xl": { label: "Enorme", size: "1.875rem", leading: "2.25rem" },
}

/** Only known steps, and `md` normalized back to "no choice". */
export function normalizeTitleSize(value: unknown): TitleSize | undefined {
  if (
    typeof value !== "string" ||
    !(TITLE_SIZE_OPTIONS as readonly string[]).includes(value)
  ) {
    return undefined
  }

  return value === DEFAULT_TITLE_SIZE ? undefined : (value as TitleSize)
}

/** `--title-size/--title-leading` for the chosen step, or `[]` for `md`. */
export function titleDeclarations(title: TitleSize | undefined): string[] {
  if (!title || title === DEFAULT_TITLE_SIZE) {
    return []
  }

  const step = TITLE_SIZES[title]
  return [
    `  --title-size: ${step.size};`,
    `  --title-leading: ${step.leading};`,
  ]
}
