import { useSyncExternalStore } from 'react'

export type SettingsView = 'form' | 'json'

/**
 * Whether the settings tab is showing the form or the raw document.
 *
 * Module-level for the same reason as the scope selection next door: only the
 * active editor tab mounts, and a view that reset itself every time the user
 * looked at another file would feel broken. It is deliberately *not* a setting —
 * a knob whose own editor is the thing it configures is a trap when the document
 * is the broken one you opened the JSON view to fix.
 */
let view: SettingsView = 'form'
const listeners = new Set<() => void>()

export function settingsView(): SettingsView {
  return view
}

export function selectSettingsView(next: SettingsView) {
  if (next === view) return

  view = next
  for (const listener of listeners) listener()
}

export function useSettingsView(): SettingsView {
  return useSyncExternalStore(subscribe, settingsView, settingsView)
}

function subscribe(listener: () => void) {
  listeners.add(listener)

  return () => listeners.delete(listener)
}
