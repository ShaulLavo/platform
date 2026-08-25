import type { TerminalColor, TerminalTheme } from 'ghostty-webgpu'

const THEME_COLOR_VARIABLES = {
  background: '--terminal-cursor-accent',
  cursor: '--terminal-cursor',
  foreground: '--terminal-foreground',
  selectionBackground: '--terminal-selection',
  selectionForeground: '--terminal-selection-foreground',
} as const satisfies Record<ThemeColorKey, string>

const PALETTE_VARIABLES = [
  '--terminal-ansi-black',
  '--terminal-ansi-red',
  '--terminal-ansi-green',
  '--terminal-ansi-yellow',
  '--terminal-ansi-blue',
  '--terminal-ansi-magenta',
  '--terminal-ansi-cyan',
  '--terminal-ansi-white',
  '--terminal-ansi-bright-black',
  '--terminal-ansi-bright-red',
  '--terminal-ansi-bright-green',
  '--terminal-ansi-bright-yellow',
  '--terminal-ansi-bright-blue',
  '--terminal-ansi-bright-magenta',
  '--terminal-ansi-bright-cyan',
  '--terminal-ansi-bright-white',
] as const

type ThemeColorKey =
  | 'background'
  | 'cursor'
  | 'foreground'
  | 'selectionBackground'
  | 'selectionForeground'

function colorChannel(value: string): number | undefined {
  const channel = Number(value.trim())
  if (!Number.isFinite(channel)) return undefined
  return Math.max(0, Math.min(255, Math.round(channel)))
}

function hexColor(value: string): TerminalColor | undefined {
  const match = value.match(/^#([\da-f]{3}|[\da-f]{6})$/iu)
  const digits = match?.[1]
  if (!digits) return undefined

  const expanded = digits.length === 3 ? [...digits].map((part) => part + part).join('') : digits
  return {
    b: Number.parseInt(expanded.slice(4, 6), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    r: Number.parseInt(expanded.slice(0, 2), 16),
  }
}

function rgbColor(value: string): TerminalColor | undefined {
  const match = value.match(/^rgba?\(([^)]+)\)$/iu)
  const parts = match?.[1]?.split(',')
  if (!parts || parts.length < 3) return undefined

  const red = colorChannel(parts[0] ?? '')
  const green = colorChannel(parts[1] ?? '')
  const blue = colorChannel(parts[2] ?? '')
  if (red === undefined || green === undefined || blue === undefined) return undefined
  return { b: blue, g: green, r: red }
}

function parseColor(value: string): TerminalColor | undefined {
  const trimmed = value.trim()
  return hexColor(trimmed) ?? rgbColor(trimmed)
}

function readColor(
  computed: CSSStyleDeclaration,
  variable: string,
  fallback: TerminalColor,
): TerminalColor {
  return parseColor(computed.getPropertyValue(variable)) ?? fallback
}

function readPalette(
  computed: CSSStyleDeclaration,
  fallback: readonly TerminalColor[],
): readonly TerminalColor[] {
  const palette = fallback.slice()
  for (const [index, variable] of PALETTE_VARIABLES.entries()) {
    palette[index] = readColor(computed, variable, fallback[index]!)
  }
  return palette
}

export function readTerminalTheme(root: HTMLElement, fallback: TerminalTheme): TerminalTheme {
  const computed = getComputedStyle(root)
  const colors = Object.fromEntries(
    Object.entries(THEME_COLOR_VARIABLES).map(([key, variable]) => [
      key,
      readColor(computed, variable, fallback[key as ThemeColorKey]),
    ]),
  ) as Record<ThemeColorKey, TerminalColor>

  return {
    ...fallback,
    ...colors,
    palette: readPalette(computed, fallback.palette),
  }
}
