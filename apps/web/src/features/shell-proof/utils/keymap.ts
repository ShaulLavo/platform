import { bottomPaneRailOperation } from '@workspace/tiling/utils/bottom-pane-model'
import { builtInWindowManagementCommands } from '@workspace/tiling/utils/layout-command-catalog'
import { layoutOperationForBuiltInWindowManagementCommand } from '@workspace/tiling/utils/layout-command-operations'
import { createFileNavigatorSurface } from '@workspace/tiling/utils/layout-builders'
import { railItemOperation } from '@workspace/tiling/utils/rail-model'
import { windowCommandDisabledReason } from '@workspace/tiling/utils/layout-selectors'
import { defaultPlatformKeyBindings } from '@/keymap/default-bindings'
import { isEditorPlatformCommandId } from '@/keymap/editor-keymap'
import { windowManagementCommandIdForWorkspaceCommand } from '@/keymap/window-management-command-ids'
import type { HotkeyMeta, RegisterableHotkey } from '@tanstack/react-hotkeys'
import type {
  BuiltInWindowManagementCommand,
  LayoutOperation,
  WindowManagementCommandId,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'
import type { PlatformKeyBinding, WorkspaceCommandId } from '@/keymap/types'

const TOGGLE_FILE_NAVIGATOR_COMMAND_ID = 'workspace.toggleSidebarVisibility'
const TOGGLE_BOTTOM_PANE_COMMAND_ID = 'workspace.togglePanel'
const RESET_LAYOUT_HOTKEY = 'Control+Alt+Shift+Backspace'

export type ShellProofHotkeyBinding =
  | {
      readonly command: BuiltInWindowManagementCommand
      readonly hotkey: RegisterableHotkey
      readonly kind: 'window-command'
      readonly title: string
    }
  | {
      readonly hotkey: RegisterableHotkey
      readonly kind: 'reset-layout' | 'toggle-bottom-pane' | 'toggle-file-navigator'
      readonly title: string
    }

export const SHELL_PROOF_HOTKEY_BINDINGS: readonly ShellProofHotkeyBinding[] =
  shellProofHotkeyBindings()

export function shellProofHotkeyOperation(
  layout: WorkspaceLayout,
  binding: ShellProofHotkeyBinding,
): LayoutOperation | null {
  switch (binding.kind) {
    case 'reset-layout':
      return null
    case 'toggle-bottom-pane':
      return bottomPaneRailOperation(layout)
    case 'toggle-file-navigator':
      return fileNavigatorToggleOperation(layout)
    case 'window-command':
      return shellProofWindowCommandOperation(layout, binding.command)
  }
}

export function shellProofHotkeyMeta(binding: ShellProofHotkeyBinding): HotkeyMeta {
  return {
    description: 'Shell proof layout command.',
    name: binding.title,
  }
}

function shellProofWindowCommandOperation(
  layout: WorkspaceLayout,
  command: BuiltInWindowManagementCommand,
): LayoutOperation | null {
  if (windowCommandDisabledReason(layout, command)) return null

  return layoutOperationForBuiltInWindowManagementCommand(layout, command)
}

function shellProofHotkeyBindings(): readonly ShellProofHotkeyBinding[] {
  const appBindings = defaultPlatformKeyBindings()
  const recipeToggleBindings = appRecipeToggleBindings(appBindings)

  return [
    ...appWindowCommandBindings(appBindings),
    ...recipeToggleBindings,
    ...fallbackBottomPaneBinding(recipeToggleBindings),
    resetLayoutBinding(),
  ]
}

function appWindowCommandBindings(
  bindings: readonly PlatformKeyBinding[],
): readonly ShellProofHotkeyBinding[] {
  const commandById = builtInWindowCommandMap()

  return bindings.flatMap((binding) => {
    const commandId = windowCommandIdForBinding(binding)
    if (!commandId) return []

    const command = commandById.get(commandId)
    if (!command) return []

    return [
      {
        command,
        hotkey: binding.hotkey,
        kind: 'window-command',
        title: command.title,
      },
    ]
  })
}

function appRecipeToggleBindings(
  bindings: readonly PlatformKeyBinding[],
): readonly ShellProofHotkeyBinding[] {
  return bindings.flatMap((binding) => recipeToggleBinding(binding))
}

function recipeToggleBinding(binding: PlatformKeyBinding): readonly ShellProofHotkeyBinding[] {
  if (binding.command === TOGGLE_FILE_NAVIGATOR_COMMAND_ID) {
    return [
      {
        hotkey: binding.hotkey,
        kind: 'toggle-file-navigator',
        title: 'Toggle Files',
      },
    ]
  }
  if (binding.command === TOGGLE_BOTTOM_PANE_COMMAND_ID) {
    return [
      {
        hotkey: binding.hotkey,
        kind: 'toggle-bottom-pane',
        title: 'Toggle Terminal',
      },
    ]
  }

  return []
}

function fallbackBottomPaneBinding(
  bindings: readonly ShellProofHotkeyBinding[],
): readonly ShellProofHotkeyBinding[] {
  if (bindings.some((binding) => binding.kind === 'toggle-bottom-pane')) return []

  return [
    {
      hotkey: 'Mod+J',
      kind: 'toggle-bottom-pane',
      title: 'Toggle Terminal',
    },
  ]
}

function resetLayoutBinding(): ShellProofHotkeyBinding {
  return {
    hotkey: RESET_LAYOUT_HOTKEY,
    kind: 'reset-layout',
    title: 'Reset Layout',
  }
}

function windowCommandIdForBinding(binding: PlatformKeyBinding): WindowManagementCommandId | null {
  if (isEditorPlatformCommandId(binding.command)) return null
  if (!binding.command) return null

  return windowManagementCommandIdForWorkspaceCommand(binding.command as WorkspaceCommandId)
}

function builtInWindowCommandMap() {
  return new Map(builtInWindowManagementCommands().map((command) => [command.id, command]))
}

function fileNavigatorToggleOperation(layout: WorkspaceLayout): LayoutOperation {
  return railItemOperation(layout, {
    kind: 'surface',
    state: 'pinned',
    surface: createFileNavigatorSurface(),
  })
}
