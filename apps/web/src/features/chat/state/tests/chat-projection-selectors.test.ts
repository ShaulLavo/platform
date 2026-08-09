import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_PROVIDER_INSTANCE_ID,
  DEFAULT_RUNTIME_MODE,
  projectIdSchema,
  threadIdSchema,
  turnIdSchema,
  type OrchestrationThread,
  type OrchestrationThreadShell,
  type ThreadId,
  type TurnId,
} from '@workspace/contracts'
import * as v from 'valibot'

import {
  selectChatSidebarThreads,
  selectChatSidebarThreadsForProject,
  selectChatThreadById,
} from '../chat-projection-selectors'
import { createInitialChatProjectionState } from '../chat-projection-store'
import {
  syncChatProjectionShellSnapshot,
  syncChatProjectionThreadDetailSnapshot,
} from '../chat-projection-writers'
import { threadShell } from '../../../../../test/factories/chat'
import { expect, test } from '../../../../../test/fixtures'

const projectId = v.parse(projectIdSchema, 'project-1')

test('derives terminal turn state from terminal session state', () => {
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

test('an archived thread is not a sidebar thread, project-scoped or not', () => {
  const state = sidebarState()

  expect(selectChatSidebarThreads(state).map((thread) => thread.id)).toEqual(['thread-live'])
  expect(selectChatSidebarThreadsForProject(state, projectId).map((thread) => thread.id)).toEqual([
    'thread-live',
  ])
})

// These feed zustand selectors: a fresh array per read is a render loop, not a detail.
test('sidebar thread lists keep their identity across reads', () => {
  const state = sidebarState()

  expect(selectChatSidebarThreads(state)).toBe(selectChatSidebarThreads(state))
  expect(selectChatSidebarThreadsForProject(state, projectId)).toBe(
    selectChatSidebarThreadsForProject(state, projectId),
  )
})

// Shell and detail subscriptions are independent, so a detail cached before a reconnect
// can land after a newer shell snapshot. Targeting a stale checkout is a real hazard.
test('a late detail snapshot cannot revert newer shell metadata', () => {
  const threadId = v.parse(threadIdSchema, 'thread-1')
  const shell = threadShell({
    branch: 'feature/new',
    id: threadId,
    projectId,
    title: 'shell title',
    worktreePath: '/worktrees/new',
  })
  let state = syncChatProjectionShellSnapshot(createInitialChatProjectionState(), {
    projects: [],
    snapshotSequence: 1,
    threads: [shell],
    updatedAt: timestamp(2),
  })

  state = syncChatProjectionThreadDetailSnapshot(state, {
    checkpoints: [],
    proposedPlans: [],
    snapshotSequence: 2,
    thread: staleDetailThread(threadId),
  })

  expect(selectChatThreadById(state, threadId)).toMatchObject({
    branch: 'feature/new',
    session: shell.session,
    title: 'shell title',
    worktreePath: '/worktrees/new',
  })
})

test('a thread the shell has not delivered yet still resolves from its detail snapshot', () => {
  const threadId = v.parse(threadIdSchema, 'thread-1')
  const state = syncChatProjectionThreadDetailSnapshot(createInitialChatProjectionState(), {
    checkpoints: [],
    proposedPlans: [],
    snapshotSequence: 1,
    thread: staleDetailThread(threadId),
  })

  expect(selectChatThreadById(state, threadId)).toMatchObject({
    branch: 'feature/stale',
    title: 'stale detail title',
  })
})

function staleDetailThread(threadId: ThreadId): OrchestrationThread {
  const source = threadShell({ id: threadId, projectId })

  return {
    ...source,
    activities: [],
    branch: 'feature/stale',
    deletedAt: null,
    messages: [],
    session: null,
    title: 'stale detail title',
    worktreePath: '/worktrees/stale',
  }
}

function sidebarState() {
  return syncChatProjectionShellSnapshot(createInitialChatProjectionState(), {
    projects: [],
    snapshotSequence: 1,
    threads: [
      threadShell({
        archivedAt: timestamp(3),
        id: v.parse(threadIdSchema, 'thread-archived'),
        projectId,
      }),
      threadShell({ id: v.parse(threadIdSchema, 'thread-live'), projectId }),
    ],
    updatedAt: timestamp(2),
  })
}

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
    projectId,
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
