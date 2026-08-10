import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import {
  orchestrationCheckpointSummarySchema,
  orchestrationProposedPlanSchema,
  orchestrationThreadDetailSnapshotSchema,
  orchestrationThreadShellSchema,
} from '../index'

const now = '2026-05-24T00:00:00.000Z'

const thread = {
  id: 'thread-1',
  projectId: 'project-1',
  title: 'Thread',
  modelSelection: { model: 'gpt-5-codex', providerInstanceId: 'codex' },
  branch: null,
  worktreePath: null,
  latestTurn: null,
  createdAt: now,
  updatedAt: now,
  archivedAt: null,
  deletedAt: null,
  messages: [],
  activities: [],
  session: null,
}

const threadShell = {
  id: 'thread-1',
  projectId: 'project-1',
  title: 'Thread',
  modelSelection: { model: 'gpt-5-codex', providerInstanceId: 'codex' },
  runtimeMode: 'full-access',
  interactionMode: 'default',
  branch: null,
  worktreePath: null,
  latestTurn: null,
  createdAt: now,
  updatedAt: now,
  archivedAt: null,
  session: null,
  latestUserMessageAt: null,
  pendingApprovalCount: 0,
  pendingUserInputCount: 0,
  hasActionableProposedPlan: false,
}

const plan = {
  id: 'plan-1',
  threadId: 'thread-1',
  turnId: 'turn-1',
  planMarkdown: '# Plan',
  createdAt: now,
  updatedAt: now,
}

const checkpoint = {
  turnId: 'turn-1',
  checkpointTurnCount: 1,
  checkpointRef: 'refs/platform/thread-1/turn-1',
  status: 'ready',
  files: [{ path: 'app.txt', kind: 'modified', additions: 2, deletions: 1 }],
  assistantMessageId: 'message-1',
  completedAt: now,
}

describe('thread detail snapshot contract', () => {
  it('carries the plans and checkpoints a cold reload needs', () => {
    const parsed = v.parse(orchestrationThreadDetailSnapshotSchema, {
      snapshotSequence: 12,
      thread,
      proposedPlans: [plan],
      checkpoints: [checkpoint],
    } as unknown)

    expect(parsed.proposedPlans[0]?.planMarkdown).toBe('# Plan')
    expect(parsed.checkpoints[0]?.files).toHaveLength(1)
  })

  it('treats an absent implementation stamp as an unimplemented plan', () => {
    const parsed = v.parse(orchestrationProposedPlanSchema, plan as unknown)

    expect(parsed.implementedAt ?? null).toBeNull()
    expect(parsed.implementationThreadId ?? null).toBeNull()
  })

  it('keeps the implementation stamp when the producer sends one', () => {
    const parsed = v.parse(orchestrationProposedPlanSchema, {
      ...plan,
      implementedAt: now,
      implementationThreadId: 'thread-2',
    } as unknown)

    expect(parsed.implementedAt).toBe(now)
    expect(parsed.implementationThreadId as string | null).toBe('thread-2')
  })

  it('rejects a checkpoint summary with no file list', () => {
    const { files, ...withoutFiles } = checkpoint

    expect(files).toHaveLength(1)
    expect(() => v.parse(orchestrationCheckpointSummarySchema, withoutFiles as unknown)).toThrow()
  })
})

describe('thread shell plan progress contract', () => {
  it('carries the step a rail row narrates instead of a spinner', () => {
    const parsed = v.parse(orchestrationThreadShellSchema, {
      ...threadShell,
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
    const parsed = v.parse(orchestrationThreadShellSchema, threadShell as unknown)

    expect(parsed.planProgress).toBeUndefined()
  })

  it('keeps a plan the provider reported outside any turn', () => {
    const parsed = v.parse(orchestrationThreadShellSchema, {
      ...threadShell,
      planProgress: { turnId: null, step: 'Draft the plan', completedSteps: 0, totalSteps: 3 },
    } as unknown)

    expect(parsed.planProgress?.turnId).toBeNull()
  })

  it('rejects a blank step, which would render as a narration of nothing', () => {
    expect(() =>
      v.parse(orchestrationThreadShellSchema, {
        ...threadShell,
        planProgress: { turnId: 'turn-1', step: '   ', completedSteps: 0, totalSteps: 3 },
      } as unknown),
    ).toThrow()
  })
})
