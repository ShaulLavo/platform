import type { ThreadId } from '@workspace/contracts'

import type { ProjectionThread } from '@/features/chat/state/chat-projection-store'

/** The completion stamp each session was last read at, keyed by thread. */
export type SessionSeenStamps = Readonly<Partial<Record<ThreadId, string>>>

type SessionCompletionSource = Pick<ProjectionThread, 'latestTurn'>

/** When the agent last stopped working on this thread; null while it never has. */
export function sessionCompletedAt(thread: SessionCompletionSource) {
  return thread.latestTurn?.completedAt ?? null
}

/**
 * Unread means "finished while you were looking somewhere else" — the one thing the
 * four live statuses cannot say, because a session that finished an hour ago and one
 * you just read both read as idle.
 *
 * What gets stored is the completion the user actually saw, not the clock at the
 * moment they saw it: the completion comes from the server, and comparing it against
 * a client `now` turns clock skew into rows that are either permanently unread or
 * never unread at all.
 */
export function isSessionUnread(completedAt: string | null, seenAt: string | undefined) {
  if (!completedAt) return false
  if (!seenAt) return true

  return stampMs(completedAt) > stampMs(seenAt)
}

function stampMs(value: string) {
  const parsed = Date.parse(value)

  return Number.isNaN(parsed) ? 0 : parsed
}
