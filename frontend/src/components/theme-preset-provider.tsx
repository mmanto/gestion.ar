import * as React from "react"

import {
  normalizeOverrides,
  type BlockId,
  type BlockOverrides,
  type BlockTone,
} from "../lib/theme-presets/blocks"
import { PRESET_CATALOG } from "../lib/theme-presets/catalog"
import {
  presetFontStylesheetUrls,
  themeCssText,
} from "../lib/theme-presets/css"
import { THEME_PRESET_STORAGE_KEY } from "../lib/theme-presets/script"
import type { ThemePreset } from "../lib/theme-presets/types"
import {
  DEFAULT_TITLE_SIZE,
  normalizeTitleSize,
  type TitleSize,
} from "../lib/theme-presets/typography"

/** What the user picked: a preset (or the base theme), tones and heading size. */
type ThemeSelection = {
  code: string | null
  overrides: BlockOverrides
  /** `undefined` is the default step, which `:root` already declares. */
  title: TitleSize | undefined
}

type ThemePresetPayload = ThemeSelection & {
  css: string
  fontUrls: string[]
}

const EMPTY_SELECTION: ThemeSelection = {
  code: null,
  overrides: {},
  title: undefined,
}

// The selection is an external store (localStorage) so it survives reloads and
// stays in sync across tabs. Kept in memory too, for environments where storage
// is blocked. The applied stylesheets live in the document rather than in React
// state: the bootstrap script writes them before the first paint, so a reload
// never flashes the base theme.
//
// The store snapshot is the raw payload string, not the parsed object: React
// compares snapshots by identity, and a string keeps that comparison by value.
const listeners = new Set<() => void>()
let memoryRaw = ""

function findPreset(code: string): ThemePreset | null {
  return PRESET_CATALOG.find((preset) => preset.code === code) ?? null
}

function parseSelection(raw: string): ThemeSelection {
  if (!raw) {
    return EMPTY_SELECTION
  }

  try {
    const payload = JSON.parse(raw)
    return {
      code: typeof payload?.code === "string" ? payload.code : null,
      overrides: normalizeOverrides(payload?.overrides),
      title: normalizeTitleSize(payload?.title),
    }
  } catch {
    return EMPTY_SELECTION
  }
}

function readRaw(): string {
  try {
    return window.localStorage.getItem(THEME_PRESET_STORAGE_KEY) ?? ""
  } catch {
    // Storage unavailable (private mode, blocked cookies).
    return memoryRaw
  }
}

function inject(payload: ThemePresetPayload) {
  document.head
    .querySelectorAll("[data-theme-preset]")
    .forEach((node) => node.remove())

  for (const url of payload.fontUrls) {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = url
    link.dataset.themePreset = "font"
    document.head.appendChild(link)
  }

  if (payload.css) {
    const style = document.createElement("style")
    style.dataset.themePreset = "tokens"
    style.textContent = payload.css
    document.head.appendChild(style)
  }
}

/** Writes the payload to the document, to storage and to the subscribers. */
function persist(
  code: string | null,
  overrides: BlockOverrides,
  title: TitleSize | undefined
) {
  const preset = code === null ? null : findPreset(code)
  const payload: ThemePresetPayload = {
    code: preset ? code : null,
    overrides,
    title,
    css: themeCssText(preset, overrides, title),
    fontUrls: preset ? presetFontStylesheetUrls(preset) : [],
  }
  const raw = JSON.stringify(payload)

  inject(payload)
  memoryRaw = raw

  try {
    window.localStorage.setItem(THEME_PRESET_STORAGE_KEY, raw)
  } catch {
    // Persisting is best-effort; the in-memory selection still applies.
  }

  listeners.forEach((listener) => listener())
}

/**
 * Applies a preset and remembers it. Block tones survive the change: they are
 * palette references, not colors. `null` is the reset — the base theme declared
 * in `app/globals.css` without any tone — and an unknown code is ignored.
 */
function applyPreset(code: string | null) {
  if (code !== null && findPreset(code) === null) {
    return
  }

  const selection = parseSelection(readRaw())
  const reset = code === null
  persist(
    code,
    reset ? {} : selection.overrides,
    reset ? undefined : selection.title
  )
}

/** Applies a block surface and remembers it; `preset` clears that override. */
function applyBlockTone(block: BlockId, tone: BlockTone) {
  const selection = parseSelection(readRaw())
  const overrides = { ...selection.overrides }

  if (tone === "preset") {
    delete overrides[block]
  } else {
    overrides[block] = tone
  }

  persist(selection.code, overrides, selection.title)
}

/** Applies a heading size and remembers it; the default step clears the choice. */
function applyTitleSize(title: TitleSize) {
  const selection = parseSelection(readRaw())
  persist(
    selection.code,
    selection.overrides,
    title === DEFAULT_TITLE_SIZE ? undefined : title
  )
}

/** Re-applies the persisted selection (the bootstrap script already painted it). */
function reapplySelection() {
  const selection = parseSelection(readRaw())
  persist(selection.code, selection.overrides, selection.title)
}

function subscribePreset(listener: () => void) {
  listeners.add(listener)
  window.addEventListener("storage", listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", listener)
  }
}

export interface ThemePresetContextValue {
  code: string | null
  preset: ThemePreset | null
  overrides: BlockOverrides
  title: TitleSize | undefined
  setPreset: (code: string | null) => void
  setBlockTone: (block: BlockId, tone: BlockTone) => void
  setTitleSize: (title: TitleSize) => void
}

// eslint-disable-next-line react-refresh/only-export-components
export const ThemePresetContext = React.createContext<ThemePresetContextValue | null>(
  null
)

export function ThemePresetProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const raw = React.useSyncExternalStore(subscribePreset, readRaw, () => "")
  const selection = React.useMemo(() => parseSelection(raw), [raw])

  // Runs on hydration and whenever another tab changes the selection. It
  // applies the *persisted* payload, never the store snapshot: during the
  // hydration render the snapshot is still the server's empty string, and
  // applying that would erase the stored selection. Idempotent — injected nodes
  // are replaced, not stacked.
  React.useEffect(() => {
    reapplySelection()
  }, [selection])

  const value = React.useMemo(
    () => ({
      code: selection.code,
      preset: selection.code === null ? null : findPreset(selection.code),
      overrides: selection.overrides,
      title: selection.title,
      setPreset: applyPreset,
      setBlockTone: applyBlockTone,
      setTitleSize: applyTitleSize,
    }),
    [selection]
  )

  return (
    <ThemePresetContext.Provider value={value}>
      {children}
    </ThemePresetContext.Provider>
  )
}

