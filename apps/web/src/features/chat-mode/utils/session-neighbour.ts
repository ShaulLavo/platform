import type { ThreadId } from '@workspace/contracts'

/**
 * Where the stage goes when the session it is showing leaves the rail. `threadIds` is
 * the rail's own order for that project, with the departing thread still in it: the row
 * below is the one the user's eye is already on, and the row above stands in for it when
 * the last session is the one going away.
 */
export function neighbourThreadId(
  threadIds: readonly ThreadId[],
  threadId: ThreadId,
): ThreadId | null {
  const index = threadIds.indexOf(threadId)
  if (index === -1) return null

  return threadIds[index + 1] ?? threadIds[index - 1] ?? null
}
