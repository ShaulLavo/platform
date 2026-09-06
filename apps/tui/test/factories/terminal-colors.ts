import { normalizeTerminalPalette, rgbToHex, type TerminalColors } from '@opentui/core'

export function terminalColors(overrides: Partial<TerminalColors> = {}): TerminalColors {
  return {
    palette: normalizeTerminalPalette().palette.slice(0, 16).map(rgbToHex),
    defaultForeground: '#eeeeee',
    defaultBackground: '#101010',
    cursorColor: null,
    mouseForeground: null,
    mouseBackground: null,
    tekForeground: null,
    tekBackground: null,
    highlightBackground: null,
    highlightForeground: null,
    ...overrides,
  }
}
