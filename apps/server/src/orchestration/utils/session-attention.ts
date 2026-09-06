import type {
  OrchestrationLatestTurn,
  SessionAttentionReason,
  SessionAttentionState,
  SessionRuntimeState,
} from '@workspace/contracts'

export type SessionAttentionInput = {
  readonly worktreeState?: string
  readonly pendingApprovalCount: number
  readonly pendingUserInputCount: number
  readonly hasActionableProposedPlan: boolean
  readonly latestFailureSequence: number | null
  readonly latestInterruptionSequence: number | null
  readonly acknowledgedFailureThroughSequence: number | null
  readonly latestTurn: Pick<OrchestrationLatestTurn, 'state'> | null
  readonly runtime: Pick<SessionRuntimeState, 'status'> | null
}

export function sessionAttention(input: SessionAttentionInput): {
  attentionState: SessionAttentionState
  attentionReason: SessionAttentionReason
  hasError: boolean
} {
  const acknowledged = input.acknowledgedFailureThroughSequence ?? 0
  const interrupted = (input.latestInterruptionSequence ?? 0) > acknowledged
  const failed = (input.latestFailureSequence ?? 0) > acknowledged
  const reason = attentionReason(input, interrupted, failed)
  if (reason)
    return {
      attentionState: 'needs-input',
      attentionReason: reason,
      hasError:
        interrupted ||
        failed ||
        input.worktreeState === 'creation-failed' ||
        input.worktreeState === 'missing',
    }
  if (input.latestTurn?.state === 'running' || isActiveRuntime(input.runtime)) {
    return { attentionState: 'working', attentionReason: 'active', hasError: false }
  }
  return { attentionState: 'settled', attentionReason: null, hasError: false }
}

function attentionReason(
  input: SessionAttentionInput,
  interrupted: boolean,
  failed: boolean,
): SessionAttentionReason {
  if (input.pendingApprovalCount > 0) return 'approval'
  if (input.pendingUserInputCount > 0) return 'user-input'
  if (interrupted) return 'interruption'
  if (input.worktreeState === 'creation-failed' || input.worktreeState === 'missing')
    return 'worktree'
  if (failed) return 'failure'
  if (input.hasActionableProposedPlan) return 'plan'
  return null
}

function isActiveRuntime(runtime: SessionAttentionInput['runtime']) {
  return (
    runtime?.status === 'starting' || runtime?.status === 'running' || runtime?.status === 'waiting'
  )
}
