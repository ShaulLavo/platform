import type { ITheme, Terminal } from 'ghostty-web'

const TERMINAL_THEME_VARIABLES = {
  background: '--terminal-background',
  foreground: '--terminal-foreground',
  cursor: '--terminal-cursor',
  cursorAccent: '--terminal-cursor-accent',
  selectionBackground: '--terminal-selection',
  selectionForeground: '--terminal-selection-foreground',
  black: '--terminal-ansi-black',
  red: '--terminal-ansi-red',
  green: '--terminal-ansi-green',
  yellow: '--terminal-ansi-yellow',
  blue: '--terminal-ansi-blue',
  magenta: '--terminal-ansi-magenta',
  cyan: '--terminal-ansi-cyan',
  white: '--terminal-ansi-white',
  brightBlack: '--terminal-ansi-bright-black',
  brightRed: '--terminal-ansi-bright-red',
  brightGreen: '--terminal-ansi-bright-green',
  brightYellow: '--terminal-ansi-bright-yellow',
  brightBlue: '--terminal-ansi-bright-blue',
  brightMagenta: '--terminal-ansi-bright-magenta',
  brightCyan: '--terminal-ansi-bright-cyan',
  brightWhite: '--terminal-ansi-bright-white',
} as const satisfies Record<keyof ITheme, string>

const FALLBACK_TERMINAL_THEME: ITheme = {
  background: '#0e1013',
  foreground: '#d7dde5',
  cursor: '#f4f7fb',
  cursorAccent: '#0e1013',
  selectionBackground: '#33455a',
  selectionForeground: '#ffffff',
}

type TerminalRuntimeThemeState = Terminal & {
  readonly scrollbarOpacity?: number
}

/**
 * Builds the terminal palette from the app's CSS design tokens so the terminal
 * stays in sync with the active light/dark theme. ghostty parses CSS color
 * strings, so the hex values defined in `globals.css` are used directly.
 */
export function readTerminalTheme(root: HTMLElement | null = documentRoot()): ITheme {
  if (!root) return FALLBACK_TERMINAL_THEME

  const computed = getComputedStyle(root)
  const theme: ITheme = {}

  for (const [key, variable] of Object.entries(TERMINAL_THEME_VARIABLES)) {
    const value = computed.getPropertyValue(variable).trim()
    if (value) {
      theme[key as keyof ITheme] = value
    }
  }

  return { ...FALLBACK_TERMINAL_THEME, ...theme }
}

export function syncTerminalTheme(
  terminal: Terminal,
  root: HTMLElement | null = documentRoot(),
): ITheme {
  const theme = readTerminalTheme(root)
  Object.assign(terminal.options.theme, theme)

  const { renderer, wasmTerm } = terminal
  if (!renderer || !wasmTerm) return theme

  renderer.setTheme(theme)
  renderer.render(wasmTerm, true, terminal.viewportY, terminal, terminalScrollbarOpacity(terminal))

  return theme
}

function terminalScrollbarOpacity(terminal: Terminal) {
  const runtimeTerminal = terminal as TerminalRuntimeThemeState
  return runtimeTerminal.scrollbarOpacity ?? 0
}

function documentRoot() {
  if (typeof document === 'undefined') return null

  return document.documentElement
}
