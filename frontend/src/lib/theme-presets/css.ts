import { blockDeclarations, type BlockOverrides } from "./blocks"
import { fontStack, fontStylesheetUrl } from "./fonts"
import type { ThemePreset } from "./types"
import { titleDeclarations, type TitleSize } from "./typography"

function declarations(tokens: Record<string, string>): string[] {
  return Object.entries(tokens).map(([name, value]) => `  --${name}: ${value};`)
}

/**
 * Stylesheet for the active preset (or, with `null`, only the block tones and
 * the heading size) plus the typography the preset asks for.
 *
 * The block tones are repeated inside both blocks: `html:root.dark` would
 * otherwise win with the preset's own value. Their `var()` references resolve
 * per theme, so a single choice covers light and dark.
 *
 * The selectors carry an extra type selector (`html:root` — specificity
 * 0,1,1 and 0,2,1) on purpose: `:root` and `.dark` from `app/globals.css`, and
 * the `--font-sans` variables `next/font` puts on `<html>`, are all 0,1,0. The
 * injected rules must win no matter in which order Next inserts the sheets.
 */
export function themeCssText(
  preset: ThemePreset | null,
  overrides: BlockOverrides = {},
  title?: TitleSize
): string {
  const tones = blockDeclarations(overrides)
  const titles = titleDeclarations(title)
  const light = preset ? declarations(preset.light) : []
  const dark = preset ? declarations(preset.dark) : []

  if (preset) {
    const sans = fontStack(preset.config.font)
    if (sans) {
      light.push(`  --font-sans: ${sans};`)
    }

    // Headings without an explicit family follow the body font.
    const heading = fontStack(
      preset.config.fontHeading === "inherit"
        ? preset.config.font
        : preset.config.fontHeading
    )
    if (heading) {
      light.push(`  --font-heading-font: ${heading};`)
    }
  }

  // The heading size is theme-independent, so it rides only in the light block
  // and applies to dark too: no other rule declares `--title-*`.
  light.push(...titles)

  const blocks: string[] = []
  if (light.length > 0 || tones.length > 0) {
    blocks.push(["html:root {", ...light, ...tones, "}"].join("\n"))
  }
  if (dark.length > 0 || tones.length > 0) {
    blocks.push(["html:root.dark {", ...dark, ...tones, "}"].join("\n"))
  }

  return blocks.join("\n")
}

/** Unique Google Fonts stylesheets the preset needs, in load order. */
export function presetFontStylesheetUrls(preset: ThemePreset): string[] {
  const urls = [
    fontStylesheetUrl(preset.config.font),
    fontStylesheetUrl(preset.config.fontHeading),
  ].filter((url): url is string => url !== null)

  return [...new Set(urls)]
}
