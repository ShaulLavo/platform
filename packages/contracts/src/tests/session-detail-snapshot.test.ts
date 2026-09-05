import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import {
  orchestrationCheckpointSummarySchema,
  orchestrationProposedPlanSchema,
  orchestrationSessionDetailSnapshotSchema,
  orchestrationSessionShellSchema,
} from '../index'

const now = '2026-05-24T00:00:00.000Z'

const session = {
  id: '35ecdd23-f0b6-593a-8d5b-108982c1126d',
  worktreeId: '22755017-f511-5766-8288-8f6328097bd2',
  title: 'Session',
  modelSelection: { model: 'gpt-5-codex', providerInstanceId: 'codex' },
  origin: 'platform',
  attentionState: 'settled',
  attentionReason: null,
  acknowledgedFailureThroughSequence: null,
  hasError: false,
  latestTurn: null,
  createdAt: now,
  updatedAt: now,
  archivedAt: null,
  deletedAt: null,
  messages: [],
  activities: [],
  runtime: null,
  deletion: null,
}

const sessionShell = {
  id: '35ecdd23-f0b6-593a-8d5b-108982c1126d',
  worktreeId: '22755017-f511-5766-8288-8f6328097bd2',
  title: 'Session',
  modelSelection: { model: 'gpt-5-codex', providerInstanceId: 'codex' },
  runtimeMode: 'full-access',
  interactionMode: 'default',
  origin: 'platform',
  attentionState: 'settled',
  attentionReason: null,
  acknowledgedFailureThroughSequence: null,
  hasError: false,
  latestTurn: null,
  createdAt: now,
  updatedAt: now,
  archivedAt: null,
  runtime: null,
  deletion: null,
  latestUserMessageAt: null,
  pendingApprovalCount: 0,
  pendingUserInputCount: 0,
  hasActionableProposedPlan: false,
}

const plan = {
  id: 'plan-1',
  sessionId: '35ecdd23-f0b6-593a-8d5b-108982c1126d',
  turnId: 'turn-1',
  planMarkdown: '# Plan',
  createdAt: now,
  updatedAt: now,
}

const checkpoint = {
  turnId: 'turn-1',
  checkpointTurnCount: 1,
  checkpointRef: 'refs/platform/session-1/turn-1',
  status: 'ready',
  files: [{ path: 'app.txt', kind: 'modified', additions: 2, deletions: 1 }],
  assistantMessageId: 'message-1',
  completedAt: now,
}

describe('session detail snapshot contract', () => {
  it('carries the plans and checkpoints a cold reload needs', () => {
    const parsed = v.parse(orchestrationSessionDetailSnapshotSchema, {
      snapshotSequence: 12,
      session,
      proposedPlans: [plan],
      checkpoints: [checkpoint],
    } as unknown)

    expect(parsed.proposedPlans[0]?.planMarkdown).toBe('# Plan')
    expect(parsed.checkpoints[0]?.files).toHaveLength(1)
  })

  it('treats an absent implementation stamp as an unimplemented plan', () => {
    const parsed = v.parse(orchestrationProposedPlanSchema, plan as unknown)

    expect(parsed.implementedAt ?? null).toBeNull()
    expect(parsed.implementationSessionId ?? null).toBeNull()
  })

  it('keeps the implementation stamp when the producer sends one', () => {
    const parsed = v.parse(orchestrationProposedPlanSchema, {
      ...plan,
      implementedAt: now,
      implementationSessionId: '8d791f9e-3506-575a-99a5-6360d6ef02da',
    } as unknown)

    expect(parsed.implementedAt).toBe(now)
    expect(parsed.implementationSessionId as string | null).toBe(
      '8d791f9e-3506-575a-99a5-6360d6ef02da',
    )
  })

  it('rejects a checkpoint summary with no file list', () => {
    const { files, ...withoutFiles } = checkpoint

    expect(files).toHaveLength(1)
    expect(() => v.parse(orchestrationCheckpointSummarySchema, withoutFiles as unknown)).toThrow()
  })
})

describe('session shell plan progress contract', () => {
  it('carries the step a rail row narrates instead of a spinner', () => {
    const parsed = v.parse(orchestrationSessionShellSchema, {
      ...sessionShell,
      planProgress: { turnId: 'turn-1', step: 'Run the tests', completedSteps: 2, totalSteps: 7 },
    } as unknown)

    expect(parsed.planProgress).toEqual({
      turnId: 'turn-1',
      step: 'Run the tests',
      completedSteps: 2,
      totalSteps: 7,
    })
  })

  it('leaves a producer that sends no plan progress distinguishable from "no plan"', () => {
    const parsed = v.parse(orchestrationSessionShellSchema, sessionShell as unknown)

    expect(parsed.planProgress).toBeUndefined()
  })

  it('keeps a plan the provider reported outside any turn', () => {
    const parsed = v.parse(orchestrationSessionShellSchema, {
      ...sessionShell,
      planProgress: { turnId: null, step: 'Draft the plan', completedSteps: 0, totalSteps: 3 },
    } as unknown)

    expect(parsed.planProgress?.turnId).toBeNull()
  })

  it('rejects a blank step, which would render as a narration of nothing', () => {
    expect(() =>
      v.parse(orchestrationSessionShellSchema, {
        ...sessionShell,
        planProgress: { turnId: 'turn-1', step: '   ', completedSteps: 0, totalSteps: 3 },
      } as unknown),
    ).toThrow()
  })
})
