import type { environmentCommands } from '@/keymap/environment-commands'
import type { FocusArea } from '@/lib/focus/state/service'
import type { HotkeyMeta, ParsedHotkey, RegisterableHotkey } from '@tanstack/hotkeys'

// `import type` on purpose: it is erased, so the command table can keep reading
// `SESSION_JUMP_POSITIONS` from here without a runtime cycle.
import type { WorkspaceCommandId } from '@/keymap/workspace-commands'
import type { editorCommands } from '@/keymap/editor-commands'

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

export type EditorPlatformCommandId = (typeof editorCommands)[number]['id']

export type PlatformCommandId =
  | WorkspaceCommandId
  | EditorPlatformCommandId
  | (typeof environmentCommands)[number]['id']

/** Every menu surface recorded as the source of a Platform command. */
export type MenuSurfaceId =
  | 'chat.composer'
  | 'chat.message'
  | 'chat.project'
  | 'chat.session'
  | 'editor.gutter'
  | 'editor.tab'
  | 'editor.text'
  | 'files.empty'
  | 'files.row'
  | 'git.file'
  | 'git.group'
  | 'pane.header'
  | 'sidebar.rail'
  | 'terminal'
  | 'titlebar'

export type KeyChord = readonly [RegisterableHotkey, ...RegisterableHotkey[]]

export type PlatformKeyBinding = {
  readonly keys: string
  readonly chord: KeyChord
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
  readonly isComposing?: boolean
  readonly keyCode?: number
  readonly repeat?: boolean
  readonly metaKey: boolean
  readonly shiftKey: boolean
}

/** A binding with each stroke parsed once, so matching never re-parses. */
export type ParsedPlatformKeyBinding = {
  readonly binding: PlatformKeyBinding
  /** Only the first stroke decides whether a binding fires in a text field. */
  readonly firesWhileTyping: boolean
  readonly steps: readonly [ParsedHotkey, ...ParsedHotkey[]]
}

/** One command's effective binding, as the settings editor lists it. */
export type CommandKeyBinding = {
  readonly command: PlatformCommandId
  readonly defaultKeys: readonly string[]
  /** The binding in force. `null` is an explicit unbind. */
  readonly keys: string | null
  readonly source: KeyBindingSource
}
