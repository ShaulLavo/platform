import { describe, expect, it } from 'bun:test'
import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_PROVIDER_INSTANCE_ID,
  DEFAULT_RUNTIME_MODE,
  projectIdSchema,
  threadIdSchema,
  turnIdSchema,
  type OrchestrationThreadShell,
  type ThreadId,
  type TurnId,
} from '@workspace/contracts'
import * as v from 'valibot'

import { selectChatThreadById } from './chat-projection-selectors'
import { createInitialChatProjectionState } from './chat-projection-store'
import { syncChatProjectionShellSnapshot } from './chat-projection-writers'

describe('chat projection selectors', () => {
  it('derives terminal turn state from terminal session state', () => {
    const threadId = v.parse(threadIdSchema, 'thread-1')
    const turnId = v.parse(turnIdSchema, 'turn-1')
    const state = syncChatProjectionShellSnapshot(createInitialChatProjectionState(), {
      projects: [],
      snapshotSequence: 1,
      threads: [makeThreadShell(threadId, turnId)],
      updatedAt: timestamp(2),
    })

    expect(selectChatThreadById(state, threadId)?.latestTurn).toMatchObject({
      completedAt: timestamp(2),
      state: 'error',
      turnId,
    })
  })
})

function makeThreadShell(threadId: ThreadId, turnId: TurnId): OrchestrationThreadShell {
  return {
    archivedAt: null,
    branch: null,
    createdAt: timestamp(1),
    hasActionableProposedPlan: false,
    id: threadId,
    interactionMode: DEFAULT_INTERACTION_MODE,
    latestTurn: {
      assistantMessageId: null,
      completedAt: null,
      requestedAt: timestamp(1),
      startedAt: null,
      state: 'running',
      turnId,
    },
    latestUserMessageAt: timestamp(1),
    modelSelection: {
      model: 'codex-test',
      providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
    },
    pendingApprovalCount: 0,
    pendingUserInputCount: 0,
    projectId: v.parse(projectIdSchema, 'project-1'),
    runtimeMode: DEFAULT_RUNTIME_MODE,
    session: {
      activeTurnId: turnId,
      lastError: 'failed',
      providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
      providerName: 'Codex',
      providerSessionId: null,
      runtimeMode: DEFAULT_RUNTIME_MODE,
      status: 'error',
      threadId,
      updatedAt: timestamp(2),
    },
    title: 'Thread',
    updatedAt: timestamp(2),
    worktreePath: null,
  }
}

function timestamp(index: number) {
  return `2026-05-28T00:00:0${index}.000Z`
}
