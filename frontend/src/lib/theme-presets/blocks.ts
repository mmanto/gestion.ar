/**
 * Surfaces ("blocks") that can be re-pointed to another part of the preset
 * palette, instead of taking whatever the selected preset handed them.
 *
 * A tone emits `var(--token)` references to tokens the preset already defines,
 * never a literal color. Two consequences: one choice works in both themes,
 * and the contrast comes from pairs the preset already guarantees
 * (`background`/`foreground`, `accent`/`accent-foreground`,
 * `primary`/`primary-foreground`).
 *
 * Each block lists only the tones it accepts, on purpose — see the note above
 * `BLOCK_DEFINITIONS` for the two rules that keep cycles impossible.
 */
export type BlockId = "sidebar" | "overlay" | "card" | "page"

export type BlockTone = "preset" | "page" | "card" | "soft" | "inverted"

/** Chosen tone per block; a block left out keeps the preset's own surface. */
export type BlockOverrides = Partial<Record<BlockId, BlockTone>>

export const BLOCK_TONE_LABELS: Record<BlockTone, string> = {
  preset: "Del preset",
  page: "Página",
  card: "Tarjeta",
  soft: "Suave",
  inverted: "Invertido",
}

/** Roles a surface needs; a block declares only the ones it actually has. */
type SurfaceRoles = Partial<Record<string, string>>

/** Palette family a tone borrows from. */
const PALETTE_ACCENTS: SurfaceRoles = {
  hover: "var(--accent)",
  hoverFg: "var(--accent-foreground)",
  line: "var(--border)",
  ring: "var(--ring)",
  strong: "var(--primary)",
  strongFg: "var(--primary-foreground)",
}

const TONE_ROLES: Record<Exclude<BlockTone, "preset">, SurfaceRoles> = {
  page: { ...PALETTE_ACCENTS, bg: "var(--background)", fg: "var(--foreground)" },
  card: { ...PALETTE_ACCENTS, bg: "var(--card)", fg: "var(--card-foreground)" },
  soft: { ...PALETTE_ACCENTS, bg: "var(--muted)", fg: "var(--foreground)" },
  inverted: {
    ...PALETTE_ACCENTS,
    bg: "var(--foreground)",
    fg: "var(--background)",
    hover: "color-mix(in oklab, var(--foreground), var(--background) 12%)",
    hoverFg: "var(--background)",
    line: "color-mix(in oklab, var(--foreground), var(--background) 14%)",
    strong: "var(--background)",
    strongFg: "var(--foreground)",
  },
}

/**
 * Each block lists only the tones — and the roles — it can take, on purpose.
 * Blocks reference each other, so a careless pair yields a CSS cycle and both
 * declarations get discarded (leaving the surface with no color at all):
 *
 * - `page` and `card` are the two surfaces that *are* family sources, so they
 *   only rewrite their own background; pointing at each other's background both
 *   ways (`page: card` + `card: page`) would make `--background` and `--card`
 *   reference one another, hence `card` is not a tone of `card` and `page` is
 *   not a tone of `page`.
 * - `sidebar` and `overlay` are self-contained clusters (nothing else writes
 *   their tokens), so they can move the whole cluster, foreground included.
 */
type BlockDefinition = {
  label: string
  /** Custom property each role writes (without the `--`). */
  roles: SurfaceRoles
  tones: readonly BlockTone[]
}

const BLOCK_DEFINITIONS: Record<BlockId, BlockDefinition> = {
  sidebar: {
    label: "Barra de menú",
    roles: {
      bg: "sidebar",
      fg: "sidebar-foreground",
      hover: "sidebar-accent",
      hoverFg: "sidebar-accent-foreground",
      line: "sidebar-border",
      ring: "sidebar-ring",
      strong: "sidebar-primary",
      strongFg: "sidebar-primary-foreground",
    },
    tones: ["preset", "page", "card", "soft", "inverted"],
  },
  overlay: {
    label: "Diálogos y menús",
    roles: { bg: "popover", fg: "popover-foreground" },
    tones: ["preset", "page", "card", "soft", "inverted"],
  },
  card: {
    label: "Tarjetas",
    roles: { bg: "card" },
    tones: ["preset", "soft"],
  },
  page: {
    label: "Página",
    roles: { bg: "background" },
    tones: ["preset", "card", "soft"],
  },
}

/** Blocks in display order, with the tones each one accepts. */
export const BLOCKS: readonly {
  id: BlockId
  label: string
  tones: readonly BlockTone[]
}[] = (Object.keys(BLOCK_DEFINITIONS) as BlockId[]).map((id) => ({
  id,
  label: BLOCK_DEFINITIONS[id].label,
  tones: BLOCK_DEFINITIONS[id].tones,
}))

/**
 * `  --token: value;` lines for the chosen tones.
 *
 * Declarations that would reference their own token are dropped: CSS reads
 * those as a cycle and discards the value (which would leave the block with no
 * surface at all).
 */
export function blockDeclarations(overrides: BlockOverrides): string[] {
  const lines: string[] = []

  for (const [id, tone] of Object.entries(overrides) as [BlockId, BlockTone][]) {
    const block = BLOCK_DEFINITIONS[id]
    if (!block || tone === "preset" || !block.tones.includes(tone)) {
      continue
    }

    const roles = TONE_ROLES[tone as Exclude<BlockTone, "preset">]

    for (const [role, token] of Object.entries(block.roles)) {
      const value = roles[role]
      if (!value || value === `var(--${token})`) {
        continue
      }
      lines.push(`  --${token}: ${value};`)
    }
  }

  return lines
}

/** Keeps only known blocks with tones they accept (`preset` means no override). */
export function normalizeOverrides(value: unknown): BlockOverrides {
  if (!value || typeof value !== "object") {
    return {}
  }

  const source = value as Record<string, unknown>
  const overrides: BlockOverrides = {}

  for (const block of BLOCKS) {
    const tone = source[block.id]
    if (
      typeof tone === "string" &&
      tone !== "preset" &&
      (block.tones as readonly string[]).includes(tone)
    ) {
      overrides[block.id] = tone as BlockTone
    }
  }

  return overrides
}
