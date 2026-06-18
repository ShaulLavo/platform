import type { FocusArea } from '@/components/workspace/focus/providers/focus-state'
import type { EditorCommandId } from '@singapor/core'
import type { HotkeyMeta, RegisterableHotkey } from '@tanstack/react-hotkeys'

type KeyBindingSource = 'default'

export type WorkspaceCommandId =
  | 'workspace.showQuickAccess'
  | 'workspace.showCommandPalette'
  | 'workspace.openFilePicker'
  | 'workspace.quickOpenPreviousEditor'
  | 'workspace.quickOpenView'
  | 'workspace.gotoSymbol'
  | 'workspace.showAllEditors'
  | 'workspace.saveFile'
  | 'workspace.saveAllFiles'
  | 'workspace.revertFile'
  | 'workspace.reopenClosedEditor'
  | 'workspace.toggleSidebarVisibility'
  | 'workspace.togglePanel'
  | 'workspace.focusFirstEditorGroup'
  | 'workspace.focusSecondEditorGroup'
  | 'workspace.focusThirdEditorGroup'
  | 'workspace.focusEditor'
  | 'workspace.focusFileTree'
  | 'workspace.focusGit'
  | 'workspace.closeCurrentTab'
  | 'workspace.toggleDiffViewMode'
  | 'workspace.selectColorMode'
  | 'workspace.setLightTheme'
  | 'workspace.setDarkTheme'
  | 'workspace.setSystemTheme'

export type EditorPlatformCommandId = `editor.${EditorCommandId}`

export type PlatformCommandId = WorkspaceCommandId | EditorPlatformCommandId

export type PlatformKeyBinding = {
  readonly keys: string
  readonly hotkey: RegisterableHotkey
  readonly command: PlatformCommandId | null
  readonly pane?: FocusArea | 'any'
  readonly source: KeyBindingSource
  readonly vscodeCommandId?: string
  readonly preventDefault?: boolean
  readonly stopPropagation?: boolean
  readonly meta?: HotkeyMeta
}
