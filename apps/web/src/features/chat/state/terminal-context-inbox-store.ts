import { create } from 'zustand'

import {
  normalizeTerminalContextSelection,
  type TerminalContextSelection,
} from '../lib/terminal-context'
import type { ChatInputTerminalContext } from './chat-input-draft-store'

/**
 * Captures made outside chat, waiting for a composer to take them.
 *
 * A handoff rather than a direct write, because at capture time there usually
 * is no composer: the terminal is right-clicked while the workbench sidebar is
 * on Files, so `ChatInput` only mounts once the reveal that follows switches
 * the tab. Writing straight into the draft store would need the active thread
 * id, which is local state inside `ChatSidePanel` and `ChatStage` — the inbox
 * lets the composer decide which draft the capture lands on, on its own terms.
 */
type TerminalContextInboxState = {
  pending: readonly ChatInputTerminalContext[]
}

type TerminalContextInboxActions = {
  /** Hands the queue over and empties it in one step, so no capture is delivered twice. */
  drain: () => readonly ChatInputTerminalContext[]
  queue: (selection: TerminalContextSelection) => ChatInputTerminalContext | null
}

export type TerminalContextInboxStore = TerminalContextInboxState & TerminalContextInboxActions

const NO_PENDING: readonly ChatInputTerminalContext[] = []

export const useTerminalContextInboxStore = create<TerminalContextInboxStore>((set, get) => ({
  pending: NO_PENDING,
  drain: () => {
    const { pending } = get()
    if (pending.length === 0) return NO_PENDING

    set({ pending: NO_PENDING })

    return pending
  },
  // Normalized on the way in so a drag that caught only padding never becomes a
  // chip; the null return is what lets the caller say "nothing was selected".
  queue: (selection) => {
    const normalized = normalizeTerminalContextSelection(selection)
    if (!normalized) return null

    const context: ChatInputTerminalContext = {
      ...normalized,
      id: `terminal-context-${crypto.randomUUID()}`,
    }
    set((state) => ({ pending: state.pending.concat(context) }))

    return context
  },
}))

export function resetTerminalContextInboxStore() {
  useTerminalContextInboxStore.setState({ pending: NO_PENDING })
}
