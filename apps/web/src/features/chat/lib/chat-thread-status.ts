import type { OrchestrationSession } from '@workspace/contracts'

import type { ChatThread } from '../state/chat-projection-store'

export function isChatThreadBusy(thread: ChatThread | undefined) {
  if (!thread) return false
  if (thread.latestTurn?.state === 'running') return true

  return isBusyChatSession(thread.session)
}

export function isBusyChatSession(session: OrchestrationSession | null) {
  if (!session) return false

  return session.status !== 'idle' && session.status !== 'stopped'
}
