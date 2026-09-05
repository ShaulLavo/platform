import type { SessionId } from '@workspace/contracts'

/**
 * Where the stage goes when the session it is showing leaves the rail. `sessionIds` is
 * the rail's own order for that project, with the departing session still in it: the row
 * below is the one the user's eye is already on, and the row above stands in for it when
 * the last session is the one going away.
 */
export function neighbourSessionId(
  sessionIds: readonly SessionId[],
  sessionId: SessionId,
): SessionId | null {
  const index = sessionIds.indexOf(sessionId)
  if (index === -1) return null

  return sessionIds[index + 1] ?? sessionIds[index - 1] ?? null
}
