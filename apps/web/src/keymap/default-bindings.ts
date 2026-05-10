import { defaultEditorKeyBindings, type EditorKeyBinding } from "@editor/core"
import {
  normalizeRegisterableHotkey,
  type RegisterableHotkey,
} from "@tanstack/react-hotkeys"

import type {
  EditorPlatformCommandId,
  PlatformKeyBinding,
  WorkspaceCommandId,
} from "./types"
import { commandHotkeyMeta } from "./command-registry"

export function defaultPlatformKeyBindings(): readonly PlatformKeyBinding[] {
  return [
    ...defaultWorkspaceKeyBindings(),
    ...defaultEditorKeyBindings().map(editorPlatformKeyBinding),
  ]
}

function defaultWorkspaceKeyBindings(): readonly PlatformKeyBinding[] {
  return [
    workspaceBinding("Mod+P", "workspace.openFilePicker"),
    workspaceBinding("Mod+1", "workspace.focusFileTree"),
    workspaceBinding("Mod+2", "workspace.focusEditor"),
    workspaceBinding("Mod+3", "workspace.focusGit"),
    workspaceBinding("Mod+W", "workspace.closeCurrentTab"),
    workspaceBinding("Mod+Shift+D", "workspace.toggleDiffViewMode"),
  ]
}

function workspaceBinding(
  hotkey: RegisterableHotkey,
  command: WorkspaceCommandId
): PlatformKeyBinding {
  return {
    command,
    hotkey,
    keys: normalizeRegisterableHotkey(hotkey),
    meta: commandHotkeyMeta(command),
    pane: "any",
    source: "default",
  }
}

function editorPlatformKeyBinding(
  binding: EditorKeyBinding
): PlatformKeyBinding {
  const command: EditorPlatformCommandId = `editor.${binding.command}`

  return {
    command,
    hotkey: binding.hotkey,
    keys: normalizeRegisterableHotkey(binding.hotkey),
    meta: commandHotkeyMeta(command),
    pane: "editor",
    preventDefault: binding.preventDefault,
    source: "default",
    stopPropagation: binding.stopPropagation,
  }
}
