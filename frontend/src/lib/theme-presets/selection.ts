/**
 * Design selection the user picked (preset, block tones, heading step) plus the
 * payload persisted for it: the prepared CSS and the font stylesheets.
 *
 * With nothing stored the app starts from `DEFAULT_SELECTION`; `PRESET_VERSION`
 * marks payloads written by a build that already knew that default, so an
 * explicit reset to the base theme (`code: null`) is not mistaken for "never
 * chose". Payloads without the mark stored `code: null` for both cases and
 * migrate to the default.
 */
import { normalizeOverrides, type BlockOverrides } from "./blocks"
import { PRESET_CATALOG } from "./catalog"
import { presetFontStylesheetUrls, themeCssText } from "./css"
import type { ThemePreset } from "./types"
import { normalizeTitleSize, type TitleSize } from "./typography"

export type ThemeSelection = {
  code: string | null
  overrides: BlockOverrides
  /** `undefined` is the default step, which `:root` already declares. */
  title: TitleSize | undefined
}

export type ThemePresetPayload = ThemeSelection & {
  version: number
  css: string
  fontUrls: string[]
}

/** Bumped whenever the payload shape or `DEFAULT_SELECTION` changes. */
export const PRESET_VERSION = 2

/**
 * Lo que ve un navegador sin elección guardada: preset Cian (`b1tNnABoO`),
 * «Barra de menú» tomando la superficie de Página y títulos en «Más grande».
 */
export const DEFAULT_SELECTION: ThemeSelection = {
  code: "b1tNnABoO",
  overrides: { sidebar: "page" },
  title: "xl",
}

export function findPreset(code: string): ThemePreset | null {
  return PRESET_CATALOG.find((preset) => preset.code === code) ?? null
}

export function parseSelection(raw: string): ThemeSelection {
  if (!raw) {
    return DEFAULT_SELECTION
  }

  try {
    const payload = JSON.parse(raw)
    const selection: ThemeSelection = {
      code: typeof payload?.code === "string" ? payload.code : null,
      overrides: normalizeOverrides(payload?.overrides),
      title: normalizeTitleSize(payload?.title),
    }

    if (payload?.version !== PRESET_VERSION && selection.code === null) {
      // Payload previo al default: `code: null` significa "sin elección".
      return DEFAULT_SELECTION
    }

    return selection
  } catch {
    return DEFAULT_SELECTION
  }
}

/** Payload listo para inyectar/persistir: tokens, fuentes y metadatos. */
export function buildPayload(selection: ThemeSelection): ThemePresetPayload {
  const preset = selection.code === null ? null : findPreset(selection.code)

  return {
    version: PRESET_VERSION,
    code: preset ? selection.code : null,
    overrides: selection.overrides,
    title: selection.title,
    css: themeCssText(preset, selection.overrides, selection.title),
    fontUrls: preset ? presetFontStylesheetUrls(preset) : [],
  }
}
