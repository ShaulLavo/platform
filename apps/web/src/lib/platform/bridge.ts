export type PlatformPickOptions = {
  mode: 'folder' | 'file'
  accept?: readonly string[]
  startingPath?: string
  multiple?: boolean
}

export type PlatformBridge = {
  pickEntry(options: PlatformPickOptions): Promise<string[]>
}

export function getPlatformBridge(): PlatformBridge | null {
  if (typeof window === 'undefined') return null

  return window.platformBridge ?? null
}

export function isDesktop() {
  return getPlatformBridge() !== null
}
