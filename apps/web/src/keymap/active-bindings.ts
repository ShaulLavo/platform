import type { WorkspaceFocusArea } from '@/components/workspace/workspace-focus-state'

import type { PlatformKeyBinding } from './types'

type SelectedBinding = {
  readonly binding: PlatformKeyBinding
  readonly priority: number
}

export function activePlatformKeyBindings(
  bindings: readonly PlatformKeyBinding[],
  focusedPane: WorkspaceFocusArea,
): readonly PlatformKeyBinding[] {
  const selected = new Map<string, SelectedBinding>()

  for (const binding of bindings) {
    selectActiveBinding(selected, binding, focusedPane)
  }

  return Array.from(selected.values(), ({ binding }) => binding)
}

function selectActiveBinding(
  selected: Map<string, SelectedBinding>,
  binding: PlatformKeyBinding,
  focusedPane: WorkspaceFocusArea,
) {
  if (!bindingMatchesFocusedPane(binding, focusedPane)) return

  const priority = bindingPriority(binding, focusedPane)
  const current = selected.get(binding.keys)
  if (current && current.priority > priority) return

  selected.set(binding.keys, { binding, priority })
}

function bindingMatchesFocusedPane(binding: PlatformKeyBinding, focusedPane: WorkspaceFocusArea) {
  if (!binding.pane) return true
  if (binding.pane === 'any') return true

  return binding.pane === focusedPane
}

function bindingPriority(binding: PlatformKeyBinding, focusedPane: WorkspaceFocusArea) {
  if (focusedPane && binding.pane === focusedPane) return 2
  if (!binding.pane || binding.pane === 'any') return 1

  return 0
}
