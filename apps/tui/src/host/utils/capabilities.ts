import type { TerminalCapabilities } from '@opentui/core'

export type TerminalColorMode = 'none' | '16' | '256' | 'truecolor'

export function terminalColorMode(
  capabilities: Pick<TerminalCapabilities, 'rgb' | 'ansi256'> | null,
  noColor: boolean,
): TerminalColorMode {
  if (noColor) return 'none'
  if (capabilities?.rgb) return 'truecolor'
  return capabilities?.ansi256 ? '256' : '16'
}
