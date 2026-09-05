/**
 * Shared reconnect policy for the orchestration streams (shell and session
 * detail). Both supervisors climb the same ladder so a server restart produces
 * one predictable retry cadence instead of two competing ones.
 */
export const STREAM_RECONNECT_DELAYS_MS = [250, 500, 1_000, 2_000, 4_000, 8_000, 16_000] as const

/** Delay before attempt `failureCount + 1`. The ladder saturates at its last rung. */
export function streamReconnectDelayMs(failureCount: number) {
  const rung = Math.min(Math.max(failureCount, 1), STREAM_RECONNECT_DELAYS_MS.length) - 1

  return STREAM_RECONNECT_DELAYS_MS[rung] ?? STREAM_RECONNECT_DELAYS_MS.at(-1) ?? 16_000
}

/**
 * Errors a timer can never fix: the socket was rejected (auth) or the aggregate
 * is gone. Retrying those burns the ladder forever and hides the real state, so
 * supervisors park and wait for an external signal (a wake, a fresh retain).
 */
export function isBlockedStreamError(error: unknown) {
  const status = streamErrorStatus(error)
  if (status === null) return false

  return status === 401 || status === 403 || status === 404
}

function streamErrorStatus(error: unknown) {
  if (!error || typeof error !== 'object') return null
  if (!('status' in error)) return null

  const status = error.status

  return typeof status === 'number' ? status : null
}
