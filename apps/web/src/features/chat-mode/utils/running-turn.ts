import type { ProjectionSession } from '@/features/chat/state/chat-projection-store'

/**
 * A turn the provider is still working on. Deliberately not `sessionStatus(session) ===
 * 'working'`: that vocabulary reports the *user-facing* state, so a session blocked on an
 * approval reads 'waiting' while its turn is very much still open.
 */
export function hasRunningTurn(session: ProjectionSession | undefined | null) {
  if (!session) return false
  if (session.latestTurn?.state === 'running') return true
  if (session.runtime?.status !== 'running' && session.runtime?.status !== 'waiting') return false

  return session.runtime.activeTurnId !== null
}
