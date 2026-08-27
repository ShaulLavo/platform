import type { SettingsValues } from '@workspace/contracts'

/**
 * Who paints what is behind the app, and how the two halves of the shell agree
 * on it.
 *
 * - `app` — nothing is behind the window, so the web layer draws its own
 *   wallpaper and its own opaque floor. A browser tab, and the macOS shell
 *   while its window is opaque.
 * - `compositor` — the window is opaque, but the window manager composites it
 *   over the real desktop and fades or blurs it there. Linux out of the box:
 *   drawing a wallpaper of our own would only cover up the user's.
 * - `transparent` — the window itself is see-through, so the desktop sits
 *   directly behind every translucent pane. The macOS NSVisualEffectView needs
 *   this, and so does per-pixel glass on Linux.
 *
 * `transparent` is not free anywhere: Electrobun's CEF implements window
 * transparency by switching to offscreen rendering, which blits the whole
 * surface through a CPU memcpy on every paint instead of letting the GPU
 * composite it. Measured on macOS: opaque produces zero OnPaint events,
 * transparent produces a 5.5MB copy per paint. The Linux build takes the same
 * path (`SetAsWindowless` + `EnableOSR`), which is why `compositor` is the
 * default there — the window manager already blends the window for free.
 */
export type ShellBackdrop = 'app' | 'compositor' | 'transparent'

/** Straight off the registry, so a rename there cannot leave the shell reading a key nobody writes. */
export type WindowTransparency = SettingsValues['window.transparency']

/** What the shell hands the web layer before its first module runs. */
export type ShellHandoff = {
  readonly backdrop: ShellBackdrop
}

const HANDOFF_GLOBAL = '__platformShell'

export function shellBackdrop(platform: string, transparency: WindowTransparency): ShellBackdrop {
  if (transparency === 'window') return 'transparent'
  if (platform === 'linux') return 'compositor'

  return 'app'
}

export function windowTransparent(backdrop: ShellBackdrop): boolean {
  return backdrop === 'transparent'
}

/**
 * Prepended to the preload bundle, so the page learns what kind of window it is
 * in from the process that created it rather than by reading the setting a
 * second time. The two can only disagree between a change and the restart the
 * setting requires — and disagreeing means painting a transparent floor into an
 * opaque window, which is a white app until the restart.
 */
export function handoffPrelude(handoff: ShellHandoff): string {
  return `globalThis.${HANDOFF_GLOBAL} = ${JSON.stringify(handoff)};\n`
}

/** Reads the prelude above. Falls back to the mode that is safe everywhere. */
export function readShellHandoff(): ShellHandoff {
  const handoff = (globalThis as Record<string, unknown>)[HANDOFF_GLOBAL]
  const backdrop = (handoff as ShellHandoff | undefined)?.backdrop

  return { backdrop: isBackdrop(backdrop) ? backdrop : 'app' }
}

function isBackdrop(value: unknown): value is ShellBackdrop {
  return value === 'app' || value === 'compositor' || value === 'transparent'
}
