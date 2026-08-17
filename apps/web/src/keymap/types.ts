import type { FocusArea } from '@/components/workspace/focus/providers/focus-state'
import type { EditorCommandId } from '@singapor/core'
import type { HotkeyMeta, ParsedHotkey, RegisterableHotkey } from '@tanstack/react-hotkeys'

// `import type` on purpose: it is erased, so the command table can keep reading
// `SESSION_JUMP_POSITIONS` from here without a runtime cycle.
import type { WorkspaceCommandId } from './workspace-commands'

/** `user` bindings come from the settings document and stand in for a default. */
export type KeyBindingSource = 'default' | 'user'

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

export type { WorkspaceCommandId }

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

/**
 * The parts of a `KeyboardEvent` a binding is matched against, narrowed so the
 * matcher can be exercised without a DOM.
 */
export type KeyBindingKeyboardEvent = {
  readonly altKey: boolean
  readonly code?: string
  readonly ctrlKey: boolean
  readonly key: string
  readonly metaKey: boolean
  readonly shiftKey: boolean
}

/** A binding with its hotkey parsed once, so matching never re-parses. */
export type ParsedPlatformKeyBinding = {
  readonly binding: PlatformKeyBinding
  /** Mod chords and Escape stay live in a text field; a bare key is a character. */
  readonly firesWhileTyping: boolean
  readonly hotkey: ParsedHotkey
}

/** One command's effective binding, as the settings editor lists it. */
export type CommandKeyBinding = {
  readonly command: PlatformCommandId
  readonly defaultKeys: readonly string[]
  /** The binding in force. `null` is an explicit unbind. */
  readonly keys: string | null
  readonly source: KeyBindingSource
}
