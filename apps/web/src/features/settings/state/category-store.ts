import { useSyncExternalStore } from 'react'

/**
 * Which category the settings page is showing, or null for all of them.
 *
 * Module-level for the same reason as the scope store: only the active editor tab
 * mounts, and a Settings tab that forgot which section you were reading every time
 * you glanced at another file would feel broken.
 */
let category: string | null = null
const listeners = new Set<() => void>()

function settingsCategory() {
  return category
}

export function selectSettingsCategory(next: string | null) {
  if (next === category) return

  category = next
  for (const listener of listeners) listener()
}

export function readSettingsCategory() {
  return category
}

/**
 * Exported because the category is an addressed slot: the address projection reads it
 * through `readSettingsCategory` and has to be told when it changes, or clearing a
 * category a link pinned leaves `?settings=` in the URL until some unrelated store
 * happens to move — which is the one-way sink this slot was made symmetric to avoid.
 */
export function subscribe(listener: () => void) {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

export function useSettingsCategory() {
  return useSyncExternalStore(subscribe, settingsCategory, settingsCategory)
}
