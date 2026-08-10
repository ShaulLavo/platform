import { defineErrorCatalog } from 'evlog'
import { orchestrationErrors } from '../observability'
import type { OrchestrationProjectedThread, OrchestrationReadModel } from './read-model'

/**
 * Refusals specific to the settle / snooze / pin lifecycle. They share the
 * `orchestration` prefix with the aggregate-level catalog so the client keeps
 * one namespace to branch on.
 */
export const threadLifecycleErrors = defineErrorCatalog('orchestration', {
  THREAD_BLOCKING_REQUEST: {
    status: 409,
    message: ({ commandType, threadId }: { commandType: string; threadId: string }) =>
      `Thread ${threadId} has an open approval or user-input request and cannot handle ${commandType}`,
    why: 'An open request is the agent waiting on the user; parking the thread would hide the very question it is asking.',
    fix: 'Answer or dismiss the pending request, then retry.',
  },
  THREAD_NOT_PINNED: {
    status: 409,
    message: ({ threadId }: { threadId: string }) => `Thread is not pinned: ${threadId}`,
    why: 'Only a pinned thread holds a slot in the arranged order, so there is nothing to reorder.',
    fix: 'Pin the thread first, or drop the reorder — a raced reorder after an unpin must not resurrect the pin.',
  },
  THREAD_QUEUED_TURN_START: {
    status: 409,
    message: ({ commandType, threadId }: { commandType: string; threadId: string }) =>
      `Thread ${threadId} has a queued turn start and cannot handle ${commandType}`,
    why: 'A user message no turn has adopted yet is work in flight with no session and no pending flags to show for it.',
    fix: 'Wait for the turn to start (or fail), then retry.',
  },
  THREAD_SESSION_ACTIVE: {
    status: 409,
    message: ({ commandType, threadId }: { commandType: string; threadId: string }) =>
      `Thread ${threadId} has an active session and cannot handle ${commandType}`,
    why: 'The provider session is starting or running, so the thread is working — settling it would park live work.',
    fix: 'Stop or interrupt the session first, or wait for the turn to finish.',
  },
  THREAD_SNOOZE_NOT_FUTURE: {
    status: 400,
    message: ({ snoozedUntil, threadId }: { snoozedUntil: string; threadId: string }) =>
      `Thread ${threadId} snooze wake time ${snoozedUntil} is not in the future`,
    why: 'A wake time already past would leave the thread carrying snooze state it can never be woken out of.',
    fix: 'Send an ISO timestamp strictly after the current server time.',
  },
})

/**
 * Session adoption takes seconds; a user message still unadopted after this
 * window is a failed or stale start, not pending work.
 */
const QUEUED_TURN_START_GRACE_MS = 2 * 60 * 1_000

/**
 * Pure guards the decider runs before it plans any event. Without them a command
 * for a missing, deleted or archived aggregate is appended to the log, receipted
 * `accepted` and published — and then silently dropped by the projector, which
 * only patches aggregates it already knows. The client is told "success" and
 * nothing happened. Every guard throws a catalogued structured error instead.
 */
export function requireThreadNotDeleted(model: OrchestrationReadModel, threadId: string) {
  const thread = model.threads.get(threadId)
  // A deleted thread is gone as far as every read surface is concerned, so a
  // tombstone reports as missing rather than as its own status.
  if (!thread || thread.deletedAt) throw orchestrationErrors.THREAD_NOT_FOUND({ threadId })

  return thread
}

export function requireThreadNotArchived(
  model: OrchestrationReadModel,
  threadId: string,
  commandType: string,
) {
  const thread = requireThreadNotDeleted(model, threadId)
  if (thread.archivedAt) throw orchestrationErrors.THREAD_ARCHIVED({ commandType, threadId })

  return thread
}

export function requireThreadArchived(model: OrchestrationReadModel, threadId: string) {
  const thread = requireThreadNotDeleted(model, threadId)
  if (!thread.archivedAt) throw orchestrationErrors.THREAD_NOT_ARCHIVED({ threadId })

  return thread
}

export function requireThreadAbsent(model: OrchestrationReadModel, threadId: string) {
  if (model.threads.has(threadId)) throw orchestrationErrors.THREAD_ALREADY_EXISTS({ threadId })
}

export function requireProject(model: OrchestrationReadModel, projectId: string) {
  const project = model.projects.get(projectId)
  if (!project || project.deletedAt) throw orchestrationErrors.PROJECT_NOT_FOUND({ projectId })

  return project
}

export function requireProjectAbsent(model: OrchestrationReadModel, projectId: string) {
  if (model.projects.has(projectId)) throw orchestrationErrors.PROJECT_ALREADY_EXISTS({ projectId })
}

/**
 * The client dedupes projects by hashing the raw path it was handed, so
 * `/repo`, `/repo/` and `/Repo` (on a case-insensitive volume) all mint
 * different project ids for one checkout. Compare normalized roots here so the
 * second one is refused instead of racing the first over the same worktrees.
 */
export function requireActiveProjectWorkspaceRootAbsent(
  model: OrchestrationReadModel,
  workspaceRoot: string,
  exceptProjectId?: string,
) {
  const normalized = normalizeWorkspaceRootForComparison(workspaceRoot)

  for (const project of model.projects.values()) {
    if (project.deletedAt) continue
    if (project.id === exceptProjectId) continue
    if (normalizeWorkspaceRootForComparison(project.workspaceRoot) !== normalized) continue

    throw orchestrationErrors.PROJECT_WORKSPACE_ROOT_TAKEN({
      projectId: project.id,
      workspaceRoot: normalized,
    })
  }
}

/**
 * Settling says "I am done with this thread". It must refuse whenever the
 * thread is still working, because a settled row is a collapsed row: a stale
 * or raced client would otherwise park work that only resurfaces once it is
 * already finished.
 */
export function requireSettleable(
  thread: OrchestrationProjectedThread,
  commandType: string,
  at: string,
) {
  if (isSessionAlive(thread)) {
    throw threadLifecycleErrors.THREAD_SESSION_ACTIVE({ commandType, threadId: thread.id })
  }

  requireNoParkedWork(thread, commandType, at)
}

/**
 * Snooze only hides a row; it never pauses the agent, so a running session is
 * snoozable. Blocked-on-you work is not: a request the agent is waiting on
 * must never be hidden, and neither must a turn nobody has adopted yet.
 */
export function requireSnoozable(
  thread: OrchestrationProjectedThread,
  commandType: string,
  at: string,
) {
  requireNoParkedWork(thread, commandType, at)
}

function requireNoParkedWork(
  thread: OrchestrationProjectedThread,
  commandType: string,
  at: string,
) {
  const { id: threadId } = thread
  if (hasOpenBlockingRequest(thread)) {
    throw threadLifecycleErrors.THREAD_BLOCKING_REQUEST({ commandType, threadId })
  }
  if (hasQueuedTurnStart(thread, at)) {
    throw threadLifecycleErrors.THREAD_QUEUED_TURN_START({ commandType, threadId })
  }
}

/**
 * The negated comparison also catches an unparseable wake time: `isoDateTime`
 * is structurally just a string, `Date.parse` yields NaN, and NaN fails every
 * comparison — an unparseable `snoozedUntil` must never persist.
 */
export function requireFutureWakeTime(threadId: string, snoozedUntil: string, at: string) {
  if (Date.parse(snoozedUntil) > Date.parse(at)) return

  throw threadLifecycleErrors.THREAD_SNOOZE_NOT_FUTURE({ snoozedUntil, threadId })
}

export function requirePinned(thread: OrchestrationProjectedThread) {
  if (thread.pinnedAt) return

  throw threadLifecycleErrors.THREAD_NOT_PINNED({ threadId: thread.id })
}

/**
 * Blocked-on-you work derived from the thread's retained activities: a request
 * with no later resolution for the same `requestId`. The read model caps
 * activities at the most recent few hundred, which is safe here — an open
 * request blocks its turn, so a thread cannot pile up hundreds of later
 * activities while one is outstanding.
 */
export function hasOpenBlockingRequest(thread: OrchestrationProjectedThread) {
  const openRequestIds = new Set<string>()

  for (const activity of thread.activities) {
    const payload = activityPayloadRecord(activity.payload)
    const requestId = typeof payload?.requestId === 'string' ? payload.requestId : null
    if (requestId === null) continue
    if (isBlockingRequestOpened(activity.kind)) {
      openRequestIds.add(requestId)
      continue
    }
    if (!isBlockingRequestClosed(activity.kind, payload)) continue

    openRequestIds.delete(requestId)
  }

  return openRequestIds.size > 0
}

function isBlockingRequestOpened(kind: string) {
  return kind === 'approval.requested' || kind === 'user-input.requested'
}

function isBlockingRequestClosed(kind: string, payload: Record<string, unknown> | null) {
  if (kind === 'approval.resolved' || kind === 'user-input.resolved') return true
  if (
    kind !== 'provider.approval.respond.failed' &&
    kind !== 'provider.user-input.respond.failed'
  ) {
    return false
  }

  return isDeadRequestFailureDetail(payload)
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

/**
 * A queued turn start is work in flight that no read surface shows yet: the
 * turn is running but no provider session has adopted it, so there is neither a
 * session status nor a pending flag to give it away. `thread.turn.start` emits
 * the message and the turn together and the session arrives later, so this is
 * the whole gap between hitting send and the agent picking the work up.
 *
 * A session that is starting or running HAS adopted the turn — that thread is
 * plainly working, which is the settle guard's business, not this one, and it
 * stays snoozable. A session that errored clears the block immediately.
 *
 * The window is bounded on BOTH sides so a turn abandoned mid-flight (a crash
 * between the event and the session) cannot block the thread forever, and so a
 * requestedAt ahead of the server clock cannot extend the block past the grace.
 */
export function hasQueuedTurnStart(thread: OrchestrationProjectedThread, at: string) {
  const latestTurn = thread.latestTurn
  if (latestTurn?.state !== 'running') return false
  if (isSessionAlive(thread)) return false
  if (thread.session?.status === 'error') return false

  const requestedAtMs = Date.parse(latestTurn.requestedAt)
  if (!Number.isFinite(requestedAtMs)) return false

  return Math.abs(Date.parse(at) - requestedAtMs) <= QUEUED_TURN_START_GRACE_MS
}

export function isSessionAlive(thread: OrchestrationProjectedThread) {
  return thread.session?.status === 'starting' || thread.session?.status === 'running'
}

export function requireExpectedBranch(
  thread: OrchestrationProjectedThread,
  expectedBranch: string | null | undefined,
) {
  if (expectedBranch === undefined) return
  if (thread.branch === expectedBranch) return

  throw orchestrationErrors.THREAD_BRANCH_CONFLICT({
    actualBranch: thread.branch,
    expectedBranch,
    threadId: thread.id,
  })
}

export function liveProjectThreads(model: OrchestrationReadModel, projectId: string) {
  return Array.from(model.threads.values()).filter(
    (thread) => thread.projectId === projectId && !thread.deletedAt,
  )
}

export function normalizeWorkspaceRootForComparison(workspaceRoot: string) {
  const trimmed = trimTrailingSeparators(workspaceRoot.trim())
  if (!isWindowsPath(trimmed)) return trimmed

  // Windows volumes are case-insensitive and accept either separator, so the
  // same checkout can arrive spelled four different ways.
  return trimmed.replaceAll('/', '\\').toLowerCase()
}

function trimTrailingSeparators(value: string) {
  if (isRootPath(value)) return value

  const trimmed = value.replace(/[\\/]+$/, '')
  if (!trimmed) return value
  // `C:` alone is the drive's current directory, not its root; keep it a root.
  if (/^[a-zA-Z]:$/.test(trimmed)) return `${trimmed}\\`

  return trimmed
}

function isRootPath(value: string) {
  return value === '/' || value === '\\' || /^[a-zA-Z]:[/\\]?$/.test(value)
}

function isWindowsPath(value: string) {
  return value.startsWith('\\\\') || /^[a-zA-Z]:([/\\]|$)/.test(value)
}
