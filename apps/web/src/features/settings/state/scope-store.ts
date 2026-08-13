import { useSyncExternalStore } from 'react'

export type SettingsScope = 'user' | 'workspace'

/**
 * Which scope the page is editing.
 *
 * Module-level rather than React state because only the active editor tab
 * mounts: a Settings tab that loses its scope selection every time the user
 * looks at another file would feel broken. Small enough that a store library
 * would be more machinery than the problem needs.
 */
let scope: SettingsScope = 'user'
const listeners = new Set<() => void>()

function settingsScope(): SettingsScope {
  return scope
}

export function selectSettingsScope(next: SettingsScope) {
  if (next === scope) return

  scope = next
  for (const listener of listeners) listener()
}

export function useSettingsScope(): SettingsScope {
  return useSyncExternalStore(subscribe, settingsScope, settingsScope)
}

function subscribe(listener: () => void) {
  listeners.add(listener)

  return () => listeners.delete(listener)
}
