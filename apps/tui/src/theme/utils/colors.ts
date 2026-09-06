import {
  normalizeTerminalPalette,
  parseColor,
  RGBA,
  type ColorInput,
  type TerminalColors,
} from '@opentui/core'

import type { TerminalColorMode } from '@/host/utils/capabilities'

export function mixColors(background: ColorInput, foreground: ColorInput, amount: number) {
  const bg = parseColor(background)
  const fg = parseColor(foreground)
  return RGBA.fromValues(
    bg.r + (fg.r - bg.r) * amount,
    bg.g + (fg.g - bg.g) * amount,
    bg.b + (fg.b - bg.b) * amount,
  )
}

function luminance(color: RGBA) {
  return (
    linearChannel(color.r) * 0.2126 +
    linearChannel(color.g) * 0.7152 +
    linearChannel(color.b) * 0.0722
  )
}

function linearChannel(channel: number) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

export function contrastRatio(first: ColorInput, second: ColorInput) {
  const a = luminance(parseColor(first))
  const b = luminance(parseColor(second))
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

export function colorForTerminal(
  color: ColorInput,
  mode: TerminalColorMode,
  colors?: TerminalColors | null,
): ColorInput {
  const input = parseColor(color)
  if (mode === 'none') return RGBA.defaultForeground()
  if (mode === 'truecolor' || input.intent !== 'rgb' || input.a === 0) return color
  const palette = normalizeTerminalPalette(colors).palette.slice(0, mode === '16' ? 16 : 256)
  let best = 0
  let distance = Infinity
  for (const [index, candidate] of palette.entries()) {
    const next =
      (input.r - candidate.r) ** 2 + (input.g - candidate.g) ** 2 + (input.b - candidate.b) ** 2
    if (next >= distance) continue
    best = index
    distance = next
  }
  return RGBA.fromIndex(best, palette[best])
}
