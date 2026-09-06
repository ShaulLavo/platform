import { createContext } from 'react'
import type { CommandBus } from '@/commands/state/bus'
import type { FocusRegistry } from '@/commands/state/focus'
import type { createKeymapSession, PendingChord } from '@/commands/state/keymap'
import type { BindingDiagnostic, TerminalBinding } from '@/commands/utils/bindings'

export type Commands = {
  readonly bus: CommandBus
  readonly focus: FocusRegistry
  readonly keymap: ReturnType<typeof createKeymapSession>
  readonly bindings: readonly TerminalBinding[]
  readonly diagnostics: readonly BindingDiagnostic[]
  readonly pending: PendingChord | null
  readonly kitty: boolean
}

export const CommandContext = createContext<Commands | null>(null)
