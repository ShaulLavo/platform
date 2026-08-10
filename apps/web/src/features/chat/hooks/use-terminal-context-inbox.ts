import { useEffect } from 'react'

import { useChatInputDraftStore, type ChatInputDraftTarget } from '../state/chat-input-draft-store'
import { useTerminalContextInboxStore } from '../state/terminal-context-inbox-store'

/**
 * Moves captures waiting in the inbox onto this composer's draft.
 *
 * The draft is the durable home — it survives a thread switch and a reload —
 * so the inbox holds a capture only for the gap between "the user asked" and
 * "a composer exists". Draining is keyed on `pending` alone: a thread switch
 * changes `draftTarget` but must not re-deliver captures the previous thread
 * already owns.
 */
export function useTerminalContextInbox(draftTarget: ChatInputDraftTarget) {
  const pending = useTerminalContextInboxStore((store) => store.pending)

  useEffect(() => {
    if (pending.length === 0) return

    const contexts = useTerminalContextInboxStore.getState().drain()
    if (contexts.length === 0) return

    useChatInputDraftStore.getState().addTerminalContexts(draftTarget, contexts)
    // `draftTarget` is read, not depended on: re-running on a thread switch
    // would drain an already-empty inbox at best and re-home a capture at worst.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])
}
