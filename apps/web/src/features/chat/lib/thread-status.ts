import type { ChatSidebarThreadSummary } from '@/features/chat/state/chat-projection-store'

/**
 * The four states a session can be in as far as the user is concerned. Turn state,
 * session status, approval counts and plan flags all collapse into this — every
 * surface that shows a session reads the same vocabulary, so a dot in the rail and
 * a badge in the header can never disagree.
 *
 * Order matters: a thread that needs you is "waiting" even while a turn is running,
 * because the run cannot finish until you answer.
 */
export type ThreadStatus = 'waiting' | 'working' | 'failed' | 'idle'

export type ThreadStatusSource = Pick<
  ChatSidebarThreadSummary,
  'hasActionableProposedPlan' | 'latestTurn' | 'pendingApprovalCount' | 'pendingUserInputCount'
> & {
  readonly session?: ChatSidebarThreadSummary['session']
}

export function threadStatus(thread: ThreadStatusSource): ThreadStatus {
  if (threadNeedsAttention(thread)) return 'waiting'
  if (thread.latestTurn?.state === 'running') return 'working'
  if (thread.session?.status === 'starting') return 'working'
  if (thread.session?.status === 'running') return 'working'
  if (thread.latestTurn?.state === 'error') return 'failed'
  if (thread.session?.status === 'error') return 'failed'

  return 'idle'
}

function threadNeedsAttention(thread: ThreadStatusSource) {
  if (thread.pendingApprovalCount > 0) return true
  if (thread.pendingUserInputCount > 0) return true
  if (!thread.hasActionableProposedPlan) return false

  return !isImplementingProposedPlan(thread)
}

/**
 * The turn that implements a plan is the answer to it. The plan's own
 * `implementedAt` stamp only reaches this client on the next projection sync,
 * so without this the thread reads "waiting for you" through the opening
 * seconds of the build the user just asked for.
 */
function isImplementingProposedPlan(thread: ThreadStatusSource) {
  if (thread.latestTurn?.state !== 'running') return false

  return Boolean(thread.latestTurn.sourceProposedPlan)
}

export function threadStatusLabel(status: ThreadStatus) {
  if (status === 'waiting') return 'Waiting for you'
  if (status === 'working') return 'Working'
  if (status === 'failed') return 'Failed'

  return 'Idle'
}

/** Token classes only — these flip with the theme and must never be palette hues. */
export function threadStatusDotClass(status: ThreadStatus) {
  if (status === 'waiting') return 'bg-warning'
  if (status === 'working') return 'bg-info animate-pulse'
  if (status === 'failed') return 'bg-destructive'

  return 'bg-muted-foreground/40'
}

export function threadStatusTextClass(status: ThreadStatus) {
  if (status === 'waiting') return 'text-warning'
  if (status === 'working') return 'text-info'
  if (status === 'failed') return 'text-destructive'

  return 'text-muted-foreground'
}
