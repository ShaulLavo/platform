import type { ChatSidebarThreadSummary } from '@/features/chat/state/chat-projection-store'

/**
 * A turn the provider is still working on. Deliberately not `threadStatus(thread) ===
 * 'working'`: that vocabulary reports the *user-facing* state, so a thread blocked on an
 * approval reads 'waiting' while its turn is very much still open.
 */
export function hasRunningTurn(thread: ChatSidebarThreadSummary | undefined | null) {
  if (!thread) return false
  if (thread.latestTurn?.state === 'running') return true
  if (thread.session?.status !== 'running' && thread.session?.status !== 'waiting') return false

  return thread.session.activeTurnId !== null
}
