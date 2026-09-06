import { parseColor, RGBA, type TerminalColors } from '@opentui/core'

import { contrastRatio, mixColors } from '@/theme/utils/colors'
import type { ThemeColors } from '@/theme/utils/theme'

export function systemTheme(colors: TerminalColors | null, fallback: ThemeColors): ThemeColors {
  if (!colors) return fallback
  const background = colors.defaultBackground ?? fallback.background
  const foreground = colors.defaultForeground ?? fallback.foreground
  const semantic = (index: number) => systemAccent(colors, index, background, foreground)
  return {
    background: RGBA.defaultBackground(background),
    foreground: RGBA.defaultForeground(foreground),
    card: mixColors(background, foreground, 0.04),
    popover: mixColors(background, foreground, 0.08),
    muted: mixColors(background, foreground, 0.12),
    accent: mixColors(background, foreground, 0.18),
    primary: semantic(6),
    primaryForeground: RGBA.defaultBackground(background),
    mutedForeground: mixColors(background, foreground, 0.68),
    border: mixColors(background, foreground, 0.26),
    destructive: semantic(1),
    info: semantic(4),
    success: semantic(2),
    warning: semantic(3),
    diffAdded: semantic(2),
    diffRemoved: semantic(1),
  }
}

function systemAccent(
  colors: TerminalColors,
  index: number,
  background: ThemeColors['background'],
  fallback: ThemeColors['foreground'],
) {
  const candidates = [colors.palette[index], colors.palette[index + 8]].filter(
    (color) => color !== null && color !== undefined,
  )
  const selected = candidates.sort(
    (a, b) => contrastRatio(b, background) - contrastRatio(a, background),
  )[0]
  if (!selected || contrastRatio(selected, background) < 3) return parseColor(fallback)
  return parseColor(selected)
}
