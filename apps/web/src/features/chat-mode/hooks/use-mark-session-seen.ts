import type { ThreadId } from '@workspace/contracts'
import { useEffect } from 'react'

import { useSessionReadStore } from '@/features/chat-mode/state/session-read-store'

/**
 * Marks the session on the stage as read up to the turn it has finished. Keyed on the
 * completion stamp as well as the thread, so a session that finishes while you are
 * watching it clears itself instead of announcing news you just read.
 */
export function useMarkSessionSeen(threadId: ThreadId | null, completedAt: string | null) {
  useEffect(() => {
    if (!threadId) return
    if (!completedAt) return

    useSessionReadStore.getState().markSeen(threadId, completedAt)
  }, [completedAt, threadId])
}
