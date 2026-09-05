import { activePlatformKeyBindings } from '@/keymap/active-bindings'
import { isEditorPlatformCommandId } from '@/keymap/editor-keymap'
import type { PlatformKeyBinding } from '@/keymap/types'
import type { FocusArea } from '@/lib/focus/state/service'

export function appKeyBindingsForPane(
  bindings: readonly PlatformKeyBinding[],
  focusedPane: FocusArea,
): readonly PlatformKeyBinding[] {
  return activePlatformKeyBindings(bindings, focusedPane).filter(isAppKeyBinding)
}

function isAppKeyBinding(binding: PlatformKeyBinding) {
  if (binding.chord.length > 1) return true

  return !isEditorPlatformCommandId(binding.command)
}
