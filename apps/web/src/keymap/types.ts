import type { WorkspaceFocusArea } from "@/components/workspace/workspace-focus-state"
import type { EditorCommandId } from "@editor/core"
import type { HotkeyMeta, RegisterableHotkey } from "@tanstack/react-hotkeys"

export type KeyBindingSource = "default"

export type WorkspaceCommandId =
  | "workspace.openFilePicker"
  | "workspace.focusEditor"
  | "workspace.focusFileTree"
  | "workspace.focusGit"
  | "workspace.closeCurrentTab"
  | "workspace.toggleDiffViewMode"

export type EditorPlatformCommandId = `editor.${EditorCommandId}`

export type PlatformCommandId = WorkspaceCommandId | EditorPlatformCommandId

export type PlatformKeyBinding = {
  readonly keys: string
  readonly hotkey: RegisterableHotkey
  readonly command: PlatformCommandId | null
  readonly pane?: WorkspaceFocusArea | "any"
  readonly source: KeyBindingSource
  readonly preventDefault?: boolean
  readonly stopPropagation?: boolean
  readonly meta?: HotkeyMeta
}
