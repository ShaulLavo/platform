import type { ProjectionSession } from '@/features/chat/state/chat-projection-store'

// Attention can require input while a provider still owns an active turn.
export function hasRunningTurn(session: ProjectionSession | undefined | null) {
  if (!session) return false
  if (session.latestTurn?.state === 'running') return true
  if (session.runtime?.status !== 'running' && session.runtime?.status !== 'waiting') return false

  return session.runtime.activeTurnId !== null
}
