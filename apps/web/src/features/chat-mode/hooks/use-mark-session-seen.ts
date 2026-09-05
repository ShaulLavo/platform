import { useEnvironmentId } from '@/lib/environments/hooks/use-environment-id'
import type { SessionId } from '@workspace/contracts'
import { useEffect } from 'react'

import { useSessionReadStore } from '@/features/chat-mode/state/session-read-store'

/**
 * Marks the session on the stage as read up to the turn it has finished. Keyed on the
 * completion stamp as well as the session, so a session that finishes while you are
 * watching it clears itself instead of announcing news you just read.
 */
export function useMarkSessionSeen(sessionId: SessionId | null, completedAt: string | null) {
  const environmentId = useEnvironmentId()
  useEffect(() => {
    if (!sessionId) return
    if (!completedAt) return

    useSessionReadStore.getState().markSeen({ environmentId, sessionId }, completedAt)
  }, [environmentId, completedAt, sessionId])
}
