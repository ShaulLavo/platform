import { activePlatformKeyBindings } from '@/keymap/active-bindings'
import type { PlatformKeyBinding } from '@/keymap/types'
import type { FocusArea } from '@/lib/focus/state/service'

export function appKeyBindingsForPane(
  bindings: readonly PlatformKeyBinding[],
  focusedPane: FocusArea,
): readonly PlatformKeyBinding[] {
  return activePlatformKeyBindings(bindings, focusedPane)
}
