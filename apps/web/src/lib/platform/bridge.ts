import type { ShellBackdrop } from '@/lib/platform/backdrop'

type PlatformPickOptions = {
  mode: 'folder' | 'file'
  accept?: readonly string[]
  startingPath?: string
  multiple?: boolean
}

export type PlatformBridge = {
  // The window the shell actually created, never what the setting currently
  // says — the two differ between a change and the restart it requires, and a
  // page that believed the setting would paint a clear floor into an opaque
  // window.
  backdrop: ShellBackdrop
  pickEntry(options: PlatformPickOptions): Promise<string[]>
}

export function getPlatformBridge(): PlatformBridge | null {
  if (typeof window === 'undefined') return null

  return window.platformBridge ?? null
}

export function isDesktop() {
  return getPlatformBridge() !== null
}
