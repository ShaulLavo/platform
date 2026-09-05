import type { SessionAttentionState } from '@workspace/contracts'
import type { ProjectionSession } from '@/features/chat/state/chat-projection-store'

export type SessionStatus = SessionAttentionState

export type SessionStatusSource = Pick<ProjectionSession, 'attentionState' | 'hasError'>

export function sessionStatus(session: SessionStatusSource): SessionStatus {
  return session.attentionState
}

export type SessionPlanProgressSource = Pick<ProjectionSession, 'latestTurn' | 'planProgress'>

/**
 * "step 3 of 7: running tests" instead of a spinner, but only while that plan
 * is the thing actually happening.
 *
 * The server keeps `planProgress` as a pure fold over retained activities so it
 * survives replay and revert, which means it outlives the turn that produced
 * it. Judging freshness is therefore the reader's job: a plan whose turn has
 * settled is history, and narrating it would have the rail confidently describe
 * work that finished an hour ago.
 */
export function sessionPlanProgressLabel(session: SessionPlanProgressSource) {
  const progress = session.planProgress
  if (!progress) return null
  if (session.latestTurn?.state !== 'running') return null
  if (progress.turnId && progress.turnId !== session.latestTurn.turnId) return null

  return {
    step: progress.step,
    stepNumber: progress.completedSteps + 1,
    totalSteps: progress.totalSteps,
  }
}

export function sessionStatusLabel(status: SessionStatus) {
  if (status === 'needs-input') return 'Waiting for you'
  if (status === 'working') return 'Working'

  return 'Settled'
}

/** Token classes only — these flip with the theme and must never be palette hues. */
export function sessionStatusDotClass(status: SessionStatus) {
  if (status === 'needs-input') return 'bg-warning'
  if (status === 'working') return 'bg-info'

  return 'bg-muted-foreground/40'
}

export function sessionStatusTextClass(status: SessionStatus) {
  if (status === 'needs-input') return 'text-warning'
  if (status === 'working') return 'text-info'

  return 'text-muted-foreground'
}
