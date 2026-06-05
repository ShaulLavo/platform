export const MIN_TERMINAL_HEIGHT = 140
export const DEFAULT_TERMINAL_HEIGHT = 280

/** Dragging the handle below this height collapses the terminal entirely. */
export const COLLAPSE_TERMINAL_HEIGHT = 96

/** Space reserved above the terminal so it never fully covers the editor. */
const TERMINAL_TOP_RESERVE = 64

export function terminalHeightStorageKey(rootPath: string) {
  return `workspace:${rootPath}:terminal-height`
}

export function clampTerminalHeight(height: number, boundsHeight: number) {
  const maxHeight = Math.max(MIN_TERMINAL_HEIGHT, boundsHeight - TERMINAL_TOP_RESERVE)

  return Math.min(Math.max(height, MIN_TERMINAL_HEIGHT), maxHeight)
}

export function readPersistedTerminalHeight(rootPath: string): number | null {
  try {
    const raw = localStorage.getItem(terminalHeightStorageKey(rootPath))
    if (!raw) return null

    const value = Number.parseInt(raw, 10)

    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

export function writePersistedTerminalHeight(rootPath: string, height: number) {
  try {
    localStorage.setItem(terminalHeightStorageKey(rootPath), String(Math.round(height)))
  } catch {
    // Ignore private-mode or quota failures; resizing should still work.
  }
}
