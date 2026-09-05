import { describe, expect, it } from 'vitest'
import { sessionAttention, type SessionAttentionInput } from '../utils/session-attention'

const settled: SessionAttentionInput = {
  pendingApprovalCount: 0,
  pendingUserInputCount: 0,
  hasActionableProposedPlan: false,
  latestFailureSequence: null,
  latestInterruptionSequence: null,
  acknowledgedFailureThroughSequence: null,
  latestTurn: null,
  runtime: null,
}

describe('projected session attention', () => {
  it.each([
    [
      {
        pendingApprovalCount: 1,
        pendingUserInputCount: 1,
        latestInterruptionSequence: 4,
        latestFailureSequence: 5,
        hasActionableProposedPlan: true,
      },
      'approval',
      true,
    ],
    [
      {
        pendingUserInputCount: 1,
        latestInterruptionSequence: 4,
        latestFailureSequence: 5,
        hasActionableProposedPlan: true,
      },
      'user-input',
      true,
    ],
    [
      { latestInterruptionSequence: 4, latestFailureSequence: 5, hasActionableProposedPlan: true },
      'interruption',
      true,
    ],
    [{ latestFailureSequence: 5, hasActionableProposedPlan: true }, 'failure', true],
    [{ hasActionableProposedPlan: true }, 'plan', false],
  ] as const)(
    'keeps reason precedence over running work: %j',
    (patch, attentionReason, hasError) => {
      expect(
        sessionAttention({
          ...settled,
          ...patch,
          latestTurn: { state: 'running' },
          runtime: { status: 'running' },
        }),
      ).toEqual({ attentionState: 'needs-input', attentionReason, hasError })
    },
  )
  it.each(['starting', 'running', 'waiting'] as const)(
    'projects active runtime %s as working',
    (status) => {
      expect(sessionAttention({ ...settled, runtime: { status } })).toEqual({
        attentionState: 'working',
        attentionReason: 'active',
        hasError: false,
      })
    },
  )
  it.each(['idle', 'ready', 'stopped', 'error', 'interrupted'] as const)(
    'settles inactive %s after acknowledgement',
    (status) => {
      expect(
        sessionAttention({
          ...settled,
          runtime: { status },
          latestFailureSequence: 5,
          latestInterruptionSequence: 6,
          acknowledgedFailureThroughSequence: 6,
        }),
      ).toEqual({ attentionState: 'settled', attentionReason: null, hasError: false })
    },
  )
  it('keeps a queued turn working before its runtime exists', () => {
    expect(sessionAttention({ ...settled, latestTurn: { state: 'running' } }).attentionState).toBe(
      'working',
    )
  })
  it('does not suppress an interruption newer than acknowledgement', () => {
    const acknowledged = {
      ...settled,
      latestFailureSequence: 6,
      acknowledgedFailureThroughSequence: 6,
    }
    expect(sessionAttention(acknowledged).hasError).toBe(false)
    expect(sessionAttention({ ...acknowledged, latestInterruptionSequence: 7 })).toEqual({
      attentionState: 'needs-input',
      attentionReason: 'interruption',
      hasError: true,
    })
  })
  it.each([
    { settledOverride: 'settled', settledAt: '2026-09-05T00:00:00.000Z' },
    { archivedAt: '2026-09-05T00:00:00.000Z' },
    { snoozedUntil: '2099-09-05T00:00:00.000Z' },
    { pinnedAt: '2026-09-05T00:00:00.000Z' },
  ])('cannot hide new attention behind a stale overlay %j', (overlay) => {
    expect(sessionAttention({ ...settled, ...overlay, pendingApprovalCount: 1 })).toEqual({
      attentionState: 'needs-input',
      attentionReason: 'approval',
      hasError: false,
    })
  })
})
