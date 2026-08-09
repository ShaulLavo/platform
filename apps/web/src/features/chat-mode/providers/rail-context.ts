import type { ProjectId, ThreadId } from '@workspace/contracts'
import { createContext, use } from 'react'

import type {
  SessionRailItem,
  SessionRailScope,
} from '@/features/chat-mode/utils/session-rail-model'
import { clientErrors } from '@/lib/structured-errors'

/**
 * The rail's own row-level behaviour: which project the list is narrowed to, and
 * which row has swapped its title for a rename field. Rows reach for it directly
 * instead of taking forwarded props, because the row menu sits two components
 * below the state that answers it.
 */
export type SessionRailActions = {
  /** The row currently being renamed, or null when none is. */
  readonly renamingSessionId: ThreadId | null
  readonly scope: SessionRailScope
  readonly endRename: () => void
  readonly openSession: (session: SessionRailItem) => void
  readonly setScope: (scope: SessionRailScope) => void
  readonly startNewSession: (projectId: ProjectId) => void
  readonly startRename: (threadId: ThreadId) => void
}

export const SessionRailContext = createContext<SessionRailActions | null>(null)

export function useSessionRail() {
  const rail = use(SessionRailContext)
  if (!rail) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useSessionRail must be used within SessionRail',
    })
  }

  return rail
}
