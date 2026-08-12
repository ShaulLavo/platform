import { create } from 'zustand'

/**
 * Commands handed to the terminal from somewhere else — a project script picked
 * in the palette, so far — waiting for a terminal that can run them.
 *
 * A queue rather than a call into a terminal, for the same reason the composer
 * has one: at the moment the user picks a script there may be no terminal
 * mounted at all, and the surface that opens next has to find the work waiting
 * for it. It also covers the opposite order — a terminal already running takes
 * the command as soon as it lands.
 *
 * Exactly one terminal must run it, which is why this is `take` and not a
 * broadcast: two mounted terminals would otherwise both fire the same script.
 */
type TerminalCommandInboxState = {
  pending: readonly string[]
}

type TerminalCommandInboxActions = {
  /**
   * Claims the whole queue, leaving it empty. The nothing-to-take case returns
   * the same frozen empty array and leaves `pending`'s identity untouched, so an
   * effect keyed on it cannot wake itself in a loop.
   */
  take: () => readonly string[]
  /** Returns false for a command with nothing in it, so callers can say so. */
  queueCommand: (command: string) => boolean
}

export type TerminalCommandInboxStore = TerminalCommandInboxState & TerminalCommandInboxActions

const NO_PENDING: readonly string[] = []

export const useTerminalCommandInboxStore = create<TerminalCommandInboxStore>((set, get) => ({
  pending: NO_PENDING,
  take: () => {
    const { pending } = get()
    if (pending.length === 0) return NO_PENDING

    set({ pending: NO_PENDING })

    return pending
  },
  queueCommand: (command) => {
    const trimmed = command.trim()
    if (trimmed.length === 0) return false

    set((state) => ({ pending: state.pending.concat(trimmed) }))

    return true
  },
}))

export function resetTerminalCommandInboxStore() {
  useTerminalCommandInboxStore.setState({ pending: NO_PENDING })
}
