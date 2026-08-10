/**
 * The blocked-on-you fold, shared by the decider guards, the in-memory
 * projector and the SQL projection so the three can never disagree on what
 * "waiting for you" means: a request is open from its `*.requested` activity
 * until a later activity resolves the same `requestId` (or reports the request
 * itself is dead). The counters the shell snapshot serves are this fold,
 * counted per kind.
 */
export type PendingRequestCounts = {
  readonly approvals: number
  readonly userInputs: number
}

type RequestActivity = {
  readonly kind: string
  readonly payload: unknown
}

type RequestKind = 'approval' | 'user-input'

export function pendingRequestCounts(activities: Iterable<RequestActivity>): PendingRequestCounts {
  const openRequestKinds = new Map<string, RequestKind>()

  for (const activity of activities) {
    foldActivity(openRequestKinds, activity)
  }

  let approvals = 0
  let userInputs = 0
  for (const kind of openRequestKinds.values()) {
    if (kind === 'approval') {
      approvals += 1
      continue
    }

    userInputs += 1
  }

  return { approvals, userInputs }
}

/**
 * The SQL projection folds a thread's whole activity history on every
 * request-relevant event, so it gates on this predicate instead of paying a
 * SELECT for every tool-call activity in a streaming turn.
 */
export function isPendingRequestActivityKind(kind: string) {
  return openedRequestKind(kind) !== null || isBlockingRequestCloseKind(kind)
}

/**
 * The `requestId` an activity payload carries, or null. Approval and user-input
 * activities all address their request through this one field, so the decider
 * lifts it into the event envelope and the fold correlates on it.
 */
export function activityRequestId(payload: unknown): string | null {
  const record = activityPayloadRecord(payload)
  if (typeof record?.requestId !== 'string') return null

  const requestId = record.requestId.trim()
  return requestId.length > 0 ? requestId : null
}

function foldActivity(openRequestKinds: Map<string, RequestKind>, activity: RequestActivity) {
  const requestId = activityRequestId(activity.payload)
  if (requestId === null) return

  const opened = openedRequestKind(activity.kind)
  if (opened) {
    openRequestKinds.set(requestId, opened)
    return
  }
  if (!isBlockingRequestClosed(activity.kind, activity.payload)) return

  openRequestKinds.delete(requestId)
}

function openedRequestKind(kind: string): RequestKind | null {
  if (kind === 'approval.requested') return 'approval'
  if (kind === 'user-input.requested') return 'user-input'

  return null
}

function isBlockingRequestCloseKind(kind: string) {
  return (
    kind === 'approval.resolved' ||
    kind === 'user-input.resolved' ||
    kind === 'provider.approval.respond.failed' ||
    kind === 'provider.user-input.respond.failed'
  )
}

function isBlockingRequestClosed(kind: string, payload: unknown) {
  if (kind === 'approval.resolved' || kind === 'user-input.resolved') return true
  if (!isRespondFailureKind(kind)) return false

  return isDeadRequestFailureDetail(activityPayloadRecord(payload))
}

function isRespondFailureKind(kind: string) {
  return (
    kind === 'provider.approval.respond.failed' || kind === 'provider.user-input.respond.failed'
  )
}

/**
 * A respond failure only clears the request when the request itself is gone —
 * the provider forgot it, or no session is bound to answer it any more. Any
 * other failure (a transient provider error) leaves the request open, because
 * the user can still answer it.
 */
function isDeadRequestFailureDetail(payload: Record<string, unknown> | null) {
  const detail = typeof payload?.detail === 'string' ? payload.detail.toLowerCase() : null
  if (detail === null) return false
  if (detail.includes('no active provider session')) return true
  if (detail.startsWith('stale pending ')) return true

  return detail.includes('unknown pending ')
}

function activityPayloadRecord(payload: unknown) {
  if (typeof payload !== 'object' || payload === null) return null

  return payload as Record<string, unknown>
}
