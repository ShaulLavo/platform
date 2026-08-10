import type { FocusArea } from '@/components/workspace/focus/providers/focus-state'
import type { EditorCommandId } from '@singapor/core'
import type { HotkeyMeta, RegisterableHotkey } from '@tanstack/react-hotkeys'

type KeyBindingSource = 'default'

/**
 * Jump-to-Nth-session slots, matching the digits they are bound to. Nine of them
 * because that is how many fit on the number row; the tenth session is what
 * next/previous are for.
 */
export const SESSION_JUMP_POSITIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const

export type SessionJumpPosition = (typeof SESSION_JUMP_POSITIONS)[number]

export type SessionJumpCommandId = `workspace.jumpToSession${SessionJumpPosition}`

export function sessionJumpCommandId(position: SessionJumpPosition): SessionJumpCommandId {
  return `workspace.jumpToSession${position}`
}

export type WorkspaceCommandId =
  | SessionJumpCommandId
  | 'workspace.newSession'
  | 'workspace.nextSession'
  | 'workspace.previousSession'
  | 'workspace.toggleSessionRail'
  | 'workspace.showQuickAccess'
  | 'workspace.showCommandPalette'
  | 'workspace.showSettings'
  | 'workspace.openFilePicker'
  | 'workspace.openSearchEditor'
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
  | 'workspace.revealChat'
  | 'workspace.closeCurrentTab'
  | 'workspace.toggleDiffViewMode'
  | 'workspace.toggleUiMode'
  | 'workspace.showChatMode'
  | 'workspace.showWorkbenchMode'
  | 'workspace.selectColorMode'
  | 'workspace.setLightTheme'
  | 'workspace.setDarkTheme'
  | 'workspace.setSystemTheme'
  | 'workspace.toggleWallpaper'

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
