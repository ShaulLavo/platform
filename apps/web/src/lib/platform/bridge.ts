type PlatformPickOptions = {
  mode: 'folder' | 'file'
  accept?: readonly string[]
  startingPath?: string
  multiple?: boolean
}

export type PlatformBridge = {
  hasNativeVibrancy: boolean
  pickEntry(options: PlatformPickOptions): Promise<string[]>
}

export function getPlatformBridge(): PlatformBridge | null {
  if (typeof window === 'undefined') return null

  return window.platformBridge ?? null
}

export function isDesktop() {
  return getPlatformBridge() !== null
}

// Being in the desktop shell is not the same as having the compositor draw the
// backdrop: the shell only gets the NSVisualEffectView once its window is
// transparent, which costs offscreen rendering and is currently off. The shell
// reports the truth, so the web layer draws its own wallpaper meanwhile.
export function hasNativeVibrancyShell() {
  return getPlatformBridge()?.hasNativeVibrancy === true
}
