/**
 * Font ids used by design presets, mapped to the family names served by Google
 * Fonts. Ids match `PRESET_FONTS` from `shadcn/preset`; `"inherit"` is not a
 * family and is filtered out by the helpers below.
 */
export const FONT_FAMILIES: Record<string, string> = {
  inter: "Inter",
  "noto-sans": "Noto Sans",
  "nunito-sans": "Nunito Sans",
  figtree: "Figtree",
  roboto: "Roboto",
  raleway: "Raleway",
  "dm-sans": "DM Sans",
  "public-sans": "Public Sans",
  outfit: "Outfit",
  "jetbrains-mono": "JetBrains Mono",
  geist: "Geist",
  "geist-mono": "Geist Mono",
  lora: "Lora",
  merriweather: "Merriweather",
  "playfair-display": "Playfair Display",
  "noto-serif": "Noto Serif",
  "roboto-slab": "Roboto Slab",
  oxanium: "Oxanium",
  manrope: "Manrope",
  "space-grotesk": "Space Grotesk",
  montserrat: "Montserrat",
  "ibm-plex-sans": "IBM Plex Sans",
  "source-sans-3": "Source Sans 3",
  "instrument-sans": "Instrument Sans",
  "eb-garamond": "EB Garamond",
  "instrument-serif": "Instrument Serif",
}

/**
 * Google Fonts stylesheet for a preset font id, or `null` for `"inherit"` and
 * unknown ids (nothing to load).
 */
export function fontStylesheetUrl(fontId: string): string | null {
  const family = FONT_FAMILIES[fontId]
  if (!family) {
    return null
  }

  return `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@400;500;600;700&display=swap`
}

/**
 * Value for a `--font-*` custom property, or `null` for `"inherit"` and unknown
 * ids (the caller keeps whatever the layout already declared).
 */
export function fontStack(fontId: string): string | null {
  const family = FONT_FAMILIES[fontId]
  if (!family) {
    return null
  }

  return `"${family}", ui-sans-serif, system-ui, sans-serif`
}
