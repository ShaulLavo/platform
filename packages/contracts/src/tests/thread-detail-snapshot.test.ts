import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import {
  orchestrationCheckpointSummarySchema,
  orchestrationProposedPlanSchema,
  orchestrationThreadDetailSnapshotSchema,
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
