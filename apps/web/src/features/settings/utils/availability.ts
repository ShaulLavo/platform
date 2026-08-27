import type { SettingId } from '@workspace/contracts'

import type { ShellBackdrop } from '@/lib/platform/backdrop'

export type SettingEnvironment = {
  readonly backdrop: ShellBackdrop
  /** Whether a desktop shell — the only thing that can create a window — is hosting us. */
  readonly isShell: boolean
}

/**
 * Whether this environment can act on a row at all.
 *
 * `window.transparency` decides how the shell creates its window, so it needs
 * both a shell to create one and a desktop that composites it over something.
 * A browser tab has no window to re-create, and the macOS shell pays offscreen
 * rendering for the transparent half — a row that writes a value nothing reads
 * is worse than no row.
 */
export function isSettingAvailable(id: SettingId, environment: SettingEnvironment): boolean {
  if (id !== 'window.transparency') return true

  return environment.isShell && environment.backdrop !== 'app'
}
