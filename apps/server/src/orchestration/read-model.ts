import type {
  MessageId,
  OrchestrationCheckpointStatus,
  OrchestrationLatestTurn,
  OrchestrationProject,
  OrchestrationSession,
  OrchestrationSessionStatus,
  OrchestrationThread,
  TurnId,
} from '@workspace/contracts'
import { orchestrationErrors } from '../observability'

/**
 * Row caps for the in-memory read model. It answers "what is this thread doing
 * right now" for the decider and the provider reactor; SQL keeps the history.
 * Uncapped, a long thread grew the model forever and every read walked it.
 */
export const MAX_THREAD_MESSAGES = 2_000
export const MAX_THREAD_ACTIVITIES = 500
export const MAX_THREAD_CHECKPOINTS = 500

export type OrchestrationProjectedCheckpoint = {
  assistantMessageId: MessageId | null
  checkpointRef: string
  checkpointTurnCount: number
  completedAt: string
  status: OrchestrationCheckpointStatus
  turnId: TurnId
}

export type OrchestrationProjectedThread = OrchestrationThread & {
  checkpointByTurnId: Record<TurnId, OrchestrationProjectedCheckpoint>
  hasActionableProposedPlan: boolean
  latestUserMessageAt: string | null
  pendingApprovalCount: number
  pendingUserInputCount: number
}

export type OrchestrationReadModel = {
  projects: Map<string, OrchestrationProject>
  sequence: number
  threads: Map<string, OrchestrationProjectedThread>
}

export function createEmptyReadModel(sequence = 0): OrchestrationReadModel {
  return {
    projects: new Map(),
    sequence,
    threads: new Map(),
  }
}

export function requireProject(model: OrchestrationReadModel, projectId: string) {
  const project = model.projects.get(projectId)
  if (!project || project.deletedAt) throw orchestrationErrors.PROJECT_NOT_FOUND({ projectId })

  return project
}

export function requireThread(model: OrchestrationReadModel, threadId: string) {
  const thread = model.threads.get(threadId)
  if (!thread || thread.deletedAt) throw orchestrationErrors.THREAD_NOT_FOUND({ threadId })

  return thread
}

export function setThreadSession(
  thread: OrchestrationProjectedThread,
  session: OrchestrationSession | null,
) {
  return {
    ...thread,
    session,
    updatedAt: session?.updatedAt ?? thread.updatedAt,
  }
}

export function setLatestTurnState(
  thread: OrchestrationProjectedThread,
  state: OrchestrationLatestTurn['state'],
  timestamp: string,
  assistantMessageId = thread.latestTurn?.assistantMessageId ?? null,
) {
  if (!thread.latestTurn) return thread

  return {
    ...thread,
    latestTurn: {
      ...thread.latestTurn,
      assistantMessageId,
      completedAt: state === 'running' ? thread.latestTurn.completedAt : timestamp,
      state,
    },
    updatedAt: timestamp,
  }
}

export function settleRunningTurn(
  thread: OrchestrationProjectedThread,
  state: 'completed' | 'interrupted' | 'error',
  timestamp: string,
) {
  if (thread.latestTurn?.state !== 'running') return thread

  return setLatestTurnState(thread, state, timestamp)
}

/**
 * Turn state to settle a still-running turn with when its session leaves the
 * "running" status, or null while the session is (re)starting or running and
 * the turn must stay unsettled. Leaving "running" is the authoritative turn
 * end: a turn that produced no assistant message has no other end signal, and
 * without one the thread spins forever.
 */
export function settledTurnStateForSessionStatus(status: OrchestrationSessionStatus) {
  switch (status) {
    case 'idle':
    case 'ready':
      return 'completed' as const
    case 'error':
      return 'error' as const
    case 'interrupted':
    case 'stopped':
      return 'interrupted' as const
    case 'starting':
    case 'running':
      return null
  }
}

/**
 * Shared by both projections so their message text cannot drift: a streaming
 * frame appends its delta, a final frame carrying text replaces the
 * accumulated draft, and a final frame with no text keeps it. Total over the
 * contract — our ingestion happens to send empty text on complete, but the
 * event schema promises no such thing.
 */
export function mergedMessageText(
  current: string | null,
  payload: { streaming: boolean; text: string },
) {
  if (current === null) return payload.text
  if (payload.streaming) return `${current}${payload.text}`
  if (payload.text.length === 0) return current

  return payload.text
}

export function appendBounded<Row>(rows: Row[], row: Row, max: number) {
  rows.push(row)
  if (rows.length <= max) return

  rows.splice(0, rows.length - max)
}

export function boundCheckpoints(
  checkpoints: Record<TurnId, OrchestrationProjectedCheckpoint>,
): Record<TurnId, OrchestrationProjectedCheckpoint> {
  const entries = Object.entries(checkpoints)
  if (entries.length <= MAX_THREAD_CHECKPOINTS) return checkpoints

  const retained = entries
    .toSorted(([, left], [, right]) => left.checkpointTurnCount - right.checkpointTurnCount)
    .slice(-MAX_THREAD_CHECKPOINTS)

  return Object.fromEntries(retained) as Record<TurnId, OrchestrationProjectedCheckpoint>
}
