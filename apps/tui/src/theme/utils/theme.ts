import { RGBA, type ColorInput, type TerminalColors } from '@opentui/core'

import palette from '@/theme/palette.json'
import type { TerminalColorMode } from '@/host/utils/capabilities'
import { colorForTerminal } from '@/theme/utils/colors'
import { systemTheme } from '@/theme/utils/system'

export type ThemeColors = { readonly [Key in keyof typeof palette.graphite.dark]: ColorInput }
export type Theme = ThemeColors & {
  readonly reducedMotion: boolean
  readonly noColor: boolean
  readonly appearance: 'dark' | 'light'
  readonly colorMode: TerminalColorMode
  readonly terminalColors: TerminalColors | null
}
export type ThemePreferences = {
  readonly palette?: 'graphite' | 'sage'
  readonly reducedMotion?: boolean
}

const plain: ThemeColors = {
  background: RGBA.defaultBackground(),
  card: RGBA.defaultBackground(),
  popover: RGBA.defaultBackground(),
  muted: RGBA.defaultBackground(),
  accent: RGBA.defaultBackground(),
  primary: RGBA.defaultForeground(),
  primaryForeground: RGBA.defaultBackground(),
  foreground: RGBA.defaultForeground(),
  mutedForeground: RGBA.defaultForeground(),
  border: RGBA.defaultForeground(),
  destructive: RGBA.defaultForeground(),
  info: RGBA.defaultForeground(),
  success: RGBA.defaultForeground(),
  warning: RGBA.defaultForeground(),
  diffAdded: RGBA.defaultForeground(),
  diffRemoved: RGBA.defaultForeground(),
}

export function resolveTheme(
  mode: 'light' | 'dark' | 'system',
  system: 'light' | 'dark',
  noColor: boolean,
  options: ThemePreferences & {
    readonly colors?: TerminalColors | null
    readonly colorMode?: TerminalColorMode
  } = {},
): Theme {
  const reducedMotion = options.reducedMotion ?? false
  const appearance = mode === 'system' ? system : mode
  const terminalColors = options.colors ?? null
  if (noColor)
    return { ...plain, noColor, reducedMotion, appearance, terminalColors, colorMode: 'none' }
  const fallback = palette[options.palette ?? 'graphite'][appearance]
  const colors = mode === 'system' ? systemTheme(options.colors ?? null, fallback) : fallback
  const colorMode = options.colorMode ?? 'truecolor'
  const convert = (color: ColorInput) => colorForTerminal(color, colorMode, options.colors)
  return {
    background: convert(colors.background),
    card: convert(colors.card),
    popover: convert(colors.popover),
    muted: convert(colors.muted),
    accent: convert(colors.accent),
    primary: convert(colors.primary),
    primaryForeground: convert(colors.primaryForeground),
    foreground: convert(colors.foreground),
    mutedForeground: convert(colors.mutedForeground),
    border: convert(colors.border),
    destructive: convert(colors.destructive),
    info: convert(colors.info),
    success: convert(colors.success),
    warning: convert(colors.warning),
    diffAdded: convert(colors.diffAdded),
    diffRemoved: convert(colors.diffRemoved),
    noColor,
    reducedMotion,
    appearance,
    colorMode,
    terminalColors,
  }
}
