import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_PROVIDER_INSTANCE_ID,
  DEFAULT_RUNTIME_MODE,
  commandIdSchema,
  eventIdSchema,
  messageIdSchema,
  projectIdSchema,
  proposedPlanIdSchema,
  threadIdSchema,
  turnIdSchema,
  type OrchestrationCheckpointSummary,
  type OrchestrationEvent,
  type OrchestrationMessage,
  type OrchestrationProjectShell,
  type OrchestrationProposedPlan,
  type OrchestrationThread,
  type OrchestrationThreadActivity,
  type OrchestrationThreadDetailSnapshot,
  type OrchestrationThreadShell,
} from '@workspace/contracts'
import * as v from 'valibot'

import { CHAT_ACTIVITY_CACHE_LIMIT, CHAT_MESSAGE_CACHE_LIMIT } from '../chat-cache-constants'
import { createInitialChatProjectionState } from '../chat-projection-store'
import {
  applyChatProjectionEvent,
  applyChatProjectionShellStreamItem,
  syncChatProjectionShellSnapshot,
  syncChatProjectionThreadDetailSnapshot,
} from '../chat-projection-writers'
import { expect, test } from '../../../../../test/fixtures'

test('preserves existing detail for threads still present in a shell snapshot', () => {
  const threadId = parseThreadId('thread-1')
  const message = makeMessage(1, threadId)
  let state = createInitialChatProjectionState()

  state = syncChatProjectionThreadDetailSnapshot(
    state,
    makeDetailSnapshot({
      snapshotSequence: 1,
      thread: makeThreadDetail({ id: threadId, messages: [message], title: 'detail title' }),
    }),
  )
  state = syncChatProjectionShellSnapshot(state, {
    projects: [makeProject()],
    snapshotSequence: 2,
    threads: [makeThreadShell({ id: threadId, title: 'shell title' })],
    updatedAt: timestamp(2),
  })

  expect(state.messageIdsByThreadId[threadId]).toEqual([message.id])
  expect(state.messageByThreadId[threadId]?.[message.id]?.text).toBe(message.text)
  expect(state.threadShellById[threadId]?.title).toBe('shell title')
})

test('removes all thread-scoped state when the shell removes a thread', () => {
  const threadId = parseThreadId('thread-1')
  const otherThreadId = parseThreadId('thread-2')
  let state = createInitialChatProjectionState()

  state = syncChatProjectionShellSnapshot(state, {
    projects: [makeProject()],
    snapshotSequence: 1,
    threads: [makeThreadShell({ id: threadId }), makeThreadShell({ id: otherThreadId })],
    updatedAt: timestamp(1),
  })
  state = syncChatProjectionThreadDetailSnapshot(
    state,
    makeDetailSnapshot({
      snapshotSequence: 2,
      thread: makeThreadDetail({
        activities: [makeActivity(1, threadId)],
        id: threadId,
        messages: [makeMessage(1, threadId)],
      }),
    }),
  )
  state = applyChatProjectionShellStreamItem(state, {
    kind: 'thread-removed',
    sequence: 3,
    threadId,
  })

  expect(state.threadIds).toEqual([otherThreadId])
  expect(state.threadShellById[threadId]).toBeUndefined()
  expect(state.threadDetailMetaById[threadId]).toBeUndefined()
  expect(state.threadSessionById[threadId]).toBeUndefined()
  expect(state.messageIdsByThreadId[threadId]).toBeUndefined()
  expect(state.activityIdsByThreadId[threadId]).toBeUndefined()
  expect(state.sidebarThreadSummaryById[threadId]).toBeUndefined()
  expect(state.threadIdsByProjectId[parseProjectId('project-1')]).toEqual([otherThreadId])
})

test('applies a detail snapshot only to the target thread detail slices', () => {
  const threadId = parseThreadId('thread-1')
  const otherThreadId = parseThreadId('thread-2')
  const otherMessage = makeMessage(2, otherThreadId)
  let state = createInitialChatProjectionState()

  state = syncChatProjectionShellSnapshot(state, {
    projects: [makeProject()],
    snapshotSequence: 1,
    threads: [
      makeThreadShell({ id: threadId, title: 'shell thread' }),
      makeThreadShell({ id: otherThreadId, title: 'other shell thread' }),
    ],
    updatedAt: timestamp(1),
  })
  state = syncChatProjectionThreadDetailSnapshot(
    state,
    makeDetailSnapshot({
      snapshotSequence: 2,
      thread: makeThreadDetail({ id: otherThreadId, messages: [otherMessage] }),
    }),
  )
  state = syncChatProjectionThreadDetailSnapshot(
    state,
    makeDetailSnapshot({
      snapshotSequence: 3,
      thread: makeThreadDetail({
        id: threadId,
        messages: [makeMessage(1, threadId)],
        title: 'detail thread',
      }),
    }),
  )

  expect(state.messageIdsByThreadId[otherThreadId]).toEqual([otherMessage.id])
  expect(state.messageIdsByThreadId[threadId]).toEqual([parseMessageId('message-1')])
  expect(state.sidebarThreadSummaryById[threadId]?.title).toBe('shell thread')
  expect(state.threadShellById[threadId]?.title).toBe('shell thread')
})

// A detail write that touched a shell record could revert branch/worktree/title/session
// behind the rail's back; keeping the mutation slice-scoped is what makes that impossible.
test('a thread detail snapshot leaves every shell-owned record untouched', () => {
  const threadId = parseThreadId('thread-1')
  let state = createInitialChatProjectionState()

  state = syncChatProjectionShellSnapshot(state, {
    projects: [makeProject()],
    snapshotSequence: 1,
    threads: [makeThreadShell({ branch: 'main', id: threadId, title: 'shell thread' })],
    updatedAt: timestamp(1),
  })

  const shellById = state.threadShellById
  const sessionById = state.threadSessionById
  const summaryById = state.sidebarThreadSummaryById
  const threadIds = state.threadIds

  state = syncChatProjectionThreadDetailSnapshot(
    state,
    makeDetailSnapshot({
      snapshotSequence: 2,
      thread: makeThreadDetail({
        branch: 'stale-detail-branch',
        id: threadId,
        title: 'detail thread',
        worktreePath: '/stale/worktree',
      }),
    }),
  )

  expect(state.threadShellById).toBe(shellById)
  expect(state.threadSessionById).toBe(sessionById)
  expect(state.sidebarThreadSummaryById).toBe(summaryById)
  expect(state.threadIds).toBe(threadIds)
  expect(state.threadDetailMetaById[threadId]?.branch).toBe('stale-detail-branch')
})

test('trims message and activity detail arrays deterministically', () => {
  const threadId = parseThreadId('thread-1')
  const messages = Array.from({ length: CHAT_MESSAGE_CACHE_LIMIT + 5 }, (_, index) =>
    makeMessage(index, threadId),
  )
  const activities = Array.from({ length: CHAT_ACTIVITY_CACHE_LIMIT + 5 }, (_, index) =>
    makeActivity(index, threadId),
  )

  const state = syncChatProjectionThreadDetailSnapshot(
    createInitialChatProjectionState(),
    makeDetailSnapshot({
      snapshotSequence: 1,
      thread: makeThreadDetail({ activities, id: threadId, messages }),
    }),
  )

  expect(state.messageIdsByThreadId[threadId]).toHaveLength(CHAT_MESSAGE_CACHE_LIMIT)
  expect(state.activityIdsByThreadId[threadId]).toHaveLength(CHAT_ACTIVITY_CACHE_LIMIT)
  expect(state.messageIdsByThreadId[threadId]?.[0]).toBe(messages[5]?.id)
  expect(state.activityIdsByThreadId[threadId]?.[0]).toBe(activities[5]?.id)
})

test('ignores stale shell and detail snapshots', () => {
  const threadId = parseThreadId('thread-1')
  let state = createInitialChatProjectionState()

  state = syncChatProjectionShellSnapshot(state, {
    projects: [makeProject({ title: 'new project' })],
    snapshotSequence: 5,
    threads: [makeThreadShell({ id: threadId, title: 'new thread' })],
    updatedAt: timestamp(5),
  })
  state = syncChatProjectionShellSnapshot(state, {
    projects: [makeProject({ title: 'old project' })],
    snapshotSequence: 4,
    threads: [makeThreadShell({ id: threadId, title: 'old thread' })],
    updatedAt: timestamp(4),
  })
  state = syncChatProjectionThreadDetailSnapshot(
    state,
    makeDetailSnapshot({
      snapshotSequence: 6,
      thread: makeThreadDetail({ id: threadId, messages: [makeMessage(6, threadId)] }),
    }),
  )
  state = syncChatProjectionThreadDetailSnapshot(
    state,
    makeDetailSnapshot({
      snapshotSequence: 5,
      thread: makeThreadDetail({ id: threadId, messages: [makeMessage(5, threadId)] }),
    }),
  )

  expect(state.projectById[parseProjectId('project-1')]?.title).toBe('new project')
  expect(state.threadShellById[threadId]?.title).toBe('new thread')
  expect(state.messageIdsByThreadId[threadId]).toEqual([parseMessageId('message-6')])
})

test('applies equal-sequence detail snapshots as authoritative detail state', () => {
  const threadId = parseThreadId('thread-1')
  const message = makeMessage(6, threadId)
  let state = createInitialChatProjectionState()

  state = syncChatProjectionThreadDetailSnapshot(
    state,
    makeDetailSnapshot({
      snapshotSequence: 6,
      thread: makeThreadDetail({ id: threadId, messages: [] }),
    }),
  )
  state = syncChatProjectionThreadDetailSnapshot(
    state,
    makeDetailSnapshot({
      snapshotSequence: 6,
      thread: makeThreadDetail({ id: threadId, messages: [message] }),
    }),
  )

  expect(state.messageIdsByThreadId[threadId]).toEqual([message.id])
  expect(state.messageByThreadId[threadId]?.[message.id]?.text).toBe(message.text)
})

// The snapshot is the whole truth for plans and checkpoints: a plan resolved (or turns
// reverted) while the stream was down leaves no event behind to remove it, so merging
// would keep the ghost — and an actionable ghost pins the subscription against eviction.
test('a detail snapshot drops plans and turn diffs the server no longer reports', () => {
  const threadId = parseThreadId('thread-1')
  const turnId = parseTurnId('turn-1')
  const planId = parseProposedPlanId('plan-1')
  let state = createInitialChatProjectionState()

  state = syncChatProjectionShellSnapshot(state, {
    projects: [makeProject()],
    snapshotSequence: 1,
    threads: [makeThreadShell({ id: threadId })],
    updatedAt: timestamp(1),
  })
  state = applyChatProjectionEvent(state, proposedPlanUpsertedEvent(threadId, planId, 2))
  state = applyChatProjectionEvent(state, turnDiffCompletedEvent(threadId, turnId, 3))

  expect(state.proposedPlanIdsByThreadId[threadId]).toEqual([planId])
  expect(state.turnDiffIdsByThreadId[threadId]).toEqual([turnId])

  state = syncChatProjectionThreadDetailSnapshot(
    state,
    makeDetailSnapshot({ snapshotSequence: 4, thread: makeThreadDetail({ id: threadId }) }),
  )

  expect(state.proposedPlanIdsByThreadId[threadId]).toEqual([])
  expect(state.proposedPlanByThreadId[threadId]).toEqual({})
  expect(state.turnDiffIdsByThreadId[threadId]).toEqual([])
  expect(state.turnDiffSummaryByThreadId[threadId]).toEqual({})
})

test('a cold detail snapshot paints the plans and checkpoints it carries', () => {
  const threadId = parseThreadId('thread-1')
  const olderPlanId = parseProposedPlanId('plan-older')
  const newerPlanId = parseProposedPlanId('plan-newer')
  const turnId = parseTurnId('turn-1')

  const state = syncChatProjectionThreadDetailSnapshot(
    createInitialChatProjectionState(),
    makeDetailSnapshot({
      checkpoints: [makeCheckpoint(turnId)],
      proposedPlans: [
        makeProposedPlan({ createdAt: timestamp(4), id: newerPlanId, threadId }),
        makeProposedPlan({ createdAt: timestamp(2), id: olderPlanId, threadId }),
      ],
      snapshotSequence: 1,
      thread: makeThreadDetail({ id: threadId }),
    }),
  )

  expect(state.proposedPlanIdsByThreadId[threadId]).toEqual([olderPlanId, newerPlanId])
  expect(state.turnDiffIdsByThreadId[threadId]).toEqual([turnId])
  expect(state.turnDiffSummaryByThreadId[threadId]?.[turnId]).toMatchObject({
    checkpointRef: 'checkpoint-1',
    files: [{ additions: 3, deletions: 1, kind: 'modified', path: 'src/a.ts' }],
    threadId,
  })
})

// The detail cursor is retained across a shell resnapshot, so the turn-start event that
// stamped this is never replayed: wiping it loses the plan banner until the next turn.
test('a shell resnapshot preserves the pending source proposed plan', () => {
  const threadId = parseThreadId('thread-1')
  const turnId = parseTurnId('turn-1')
  const planId = parseProposedPlanId('plan-1')
  let state = createInitialChatProjectionState()

  state = syncChatProjectionShellSnapshot(state, {
    projects: [makeProject()],
    snapshotSequence: 1,
    threads: [makeThreadShell({ id: threadId })],
    updatedAt: timestamp(1),
  })
  state = applyChatProjectionEvent(state, turnStartRequestedEvent(threadId, turnId, planId))
  state = syncChatProjectionShellSnapshot(state, {
    projects: [makeProject()],
    snapshotSequence: 3,
    threads: [
      makeThreadShell({
        id: threadId,
        latestTurn: runningLatestTurn(turnId),
        updatedAt: timestamp(3),
      }),
    ],
    updatedAt: timestamp(3),
  })

  expect(state.threadTurnStateById[threadId]?.pendingSourceProposedPlan).toEqual({
    planId,
    threadId,
  })
})

test('keeps sidebar summaries shell-owned while detail events update local turn state', () => {
  const threadId = parseThreadId('thread-1')
  const turnId = parseTurnId('turn-1')
  let state = createInitialChatProjectionState()

  state = syncChatProjectionShellSnapshot(state, {
    projects: [makeProject()],
    snapshotSequence: 1,
    threads: [
      makeThreadShell({
        id: threadId,
        latestTurn: runningLatestTurn(turnId),
        updatedAt: timestamp(1),
      }),
    ],
    updatedAt: timestamp(1),
  })

  const summaryBefore = state.sidebarThreadSummaryById[threadId]
  state = applyChatProjectionEvent(state, assistantCompleteEvent(threadId, turnId))

  expect(state.sidebarThreadSummaryById[threadId]).toBe(summaryBefore)
  expect(state.threadTurnStateById[threadId]?.latestTurn).toMatchObject({
    assistantMessageId: parseMessageId('message-assistant'),
    completedAt: timestamp(4),
    state: 'completed',
    turnId,
  })
})

test('marks live provider turn failures as terminal in local turn state', () => {
  const threadId = parseThreadId('thread-1')
  const turnId = parseTurnId('turn-1')
  let state = createInitialChatProjectionState()

  state = syncChatProjectionShellSnapshot(state, {
    projects: [makeProject()],
    snapshotSequence: 1,
    threads: [
      makeThreadShell({
        id: threadId,
        latestTurn: runningLatestTurn(turnId),
        updatedAt: timestamp(1),
      }),
    ],
    updatedAt: timestamp(1),
  })
  state = applyChatProjectionEvent(state, providerFailureActivityEvent(threadId, turnId))

  expect(state.threadTurnStateById[threadId]?.latestTurn).toMatchObject({
    completedAt: timestamp(5),
    state: 'error',
    turnId,
  })
})

test('projects streamed assistant deltas before completion without duplicating text', () => {
  const threadId = parseThreadId('thread-1')
  const turnId = parseTurnId('turn-1')
  const messageId = parseMessageId('message-assistant')
  let state = createInitialChatProjectionState()

  state = syncChatProjectionShellSnapshot(state, {
    projects: [makeProject()],
    snapshotSequence: 1,
    threads: [
      makeThreadShell({
        id: threadId,
        latestTurn: { ...runningLatestTurn(turnId), startedAt: timestamp(1) },
        updatedAt: timestamp(1),
      }),
    ],
    updatedAt: timestamp(1),
  })
  state = applyChatProjectionEvent(
    state,
    assistantMessageEvent({
      messageId,
      sequence: 2,
      streaming: true,
      text: 'Hello ',
      threadId,
      turnId,
    }),
  )
  state = applyChatProjectionEvent(
    state,
    assistantMessageEvent({
      messageId,
      sequence: 3,
      streaming: true,
      text: 'world',
      threadId,
      turnId,
    }),
  )
  state = applyChatProjectionEvent(
    state,
    assistantMessageEvent({ messageId, sequence: 4, streaming: false, text: '', threadId, turnId }),
  )

  expect(state.messageByThreadId[threadId]?.[messageId]).toMatchObject({
    streaming: false,
    text: 'Hello world',
  })
  expect(state.threadTurnStateById[threadId]?.latestTurn).toMatchObject({
    assistantMessageId: messageId,
    completedAt: timestamp(4),
    state: 'completed',
    turnId,
  })
})

function makeDetailSnapshot({
  checkpoints = [],
  proposedPlans = [],
  snapshotSequence,
  thread,
}: {
  checkpoints?: OrchestrationCheckpointSummary[]
  proposedPlans?: OrchestrationProposedPlan[]
  snapshotSequence: number
  thread: OrchestrationThread
}): OrchestrationThreadDetailSnapshot {
  return { checkpoints, proposedPlans, snapshotSequence, thread }
}

function makeProject(
  overrides: Partial<OrchestrationProjectShell> = {},
): OrchestrationProjectShell {
  return {
    createdAt: timestamp(0),
    defaultModelSelection: null,
    id: parseProjectId('project-1'),
    title: 'Project',
    updatedAt: timestamp(0),
    workspaceRoot: '/workspace',
    ...overrides,
  }
}

function makeThreadShell(
  overrides: Partial<OrchestrationThreadShell> = {},
): OrchestrationThreadShell {
  return {
    archivedAt: null,
    branch: null,
    createdAt: timestamp(0),
    hasActionableProposedPlan: false,
    id: parseThreadId('thread-1'),
    interactionMode: DEFAULT_INTERACTION_MODE,
    latestTurn: null,
    latestUserMessageAt: null,
    modelSelection: {
      model: 'codex-test',
      providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
    },
    pendingApprovalCount: 0,
    pendingUserInputCount: 0,
    projectId: parseProjectId('project-1'),
    runtimeMode: DEFAULT_RUNTIME_MODE,
    session: null,
    title: 'Thread',
    updatedAt: timestamp(0),
    worktreePath: null,
    ...overrides,
  }
}

function makeThreadDetail(overrides: Partial<OrchestrationThread> = {}): OrchestrationThread {
  return {
    ...makeThreadShell(overrides),
    activities: [],
    deletedAt: null,
    messages: [],
    ...overrides,
  }
}

function makeProposedPlan(
  overrides: Partial<OrchestrationProposedPlan> = {},
): OrchestrationProposedPlan {
  return {
    createdAt: timestamp(2),
    id: parseProposedPlanId('plan-1'),
    implementationThreadId: null,
    implementedAt: null,
    planMarkdown: '# Plan',
    threadId: parseThreadId('thread-1'),
    turnId: null,
    updatedAt: timestamp(2),
    ...overrides,
  }
}

function makeCheckpoint(
  turnId: ReturnType<typeof parseTurnId>,
  overrides: Partial<OrchestrationCheckpointSummary> = {},
): OrchestrationCheckpointSummary {
  return {
    assistantMessageId: null,
    checkpointRef: 'checkpoint-1',
    checkpointTurnCount: 1,
    completedAt: timestamp(3),
    files: [{ additions: 3, deletions: 1, kind: 'modified', path: 'src/a.ts' }],
    status: 'ready',
    turnId,
    ...overrides,
  }
}

function runningLatestTurn(turnId: ReturnType<typeof parseTurnId>) {
  return {
    assistantMessageId: null,
    completedAt: null,
    requestedAt: timestamp(1),
    startedAt: null,
    state: 'running',
    turnId,
  } as const
}

function makeMessage(
  index: number,
  threadId: ReturnType<typeof parseThreadId>,
): OrchestrationMessage {
  return {
    attachments: [],
    createdAt: timestamp(index),
    id: parseMessageId(`message-${index}`),
    role: 'assistant',
    streaming: false,
    text: `message ${index}`,
    threadId,
    turnId: null,
    updatedAt: timestamp(index),
  }
}

function makeActivity(
  index: number,
  threadId: ReturnType<typeof parseThreadId>,
  overrides: Partial<OrchestrationThreadActivity> = {},
): OrchestrationThreadActivity {
  return {
    createdAt: timestamp(index),
    id: parseEventId(`event-${index}`),
    kind: 'tool',
    payload: null,
    sequence: index,
    summary: `activity ${index}`,
    threadId,
    tone: 'tool',
    turnId: null,
    ...overrides,
  }
}

function makeThreadEvent(
  threadId: ReturnType<typeof parseThreadId>,
  sequence: number,
  slug: string,
): Omit<Extract<OrchestrationEvent, { type: 'thread.message-sent' }>, 'payload' | 'type'> {
  return {
    actorKind: 'provider',
    aggregateId: threadId,
    aggregateKind: 'thread',
    causationEventId: null,
    commandId: parseCommandId(`command-${slug}`),
    correlationId: parseCommandId(`command-${slug}`),
    eventId: parseEventId(`event-${slug}`),
    metadata: {},
    occurredAt: timestamp(sequence),
    sequence,
  }
}

function assistantCompleteEvent(
  threadId: ReturnType<typeof parseThreadId>,
  turnId: ReturnType<typeof parseTurnId>,
): OrchestrationEvent {
  return {
    ...makeThreadEvent(threadId, 2, 'assistant-complete'),
    occurredAt: timestamp(4),
    payload: {
      attachments: [],
      createdAt: timestamp(4),
      messageId: parseMessageId('message-assistant'),
      role: 'assistant',
      streaming: false,
      text: '',
      threadId,
      turnId,
      updatedAt: timestamp(4),
    },
    type: 'thread.message-sent',
  }
}

function assistantMessageEvent({
  messageId,
  sequence,
  streaming,
  text,
  threadId,
  turnId,
}: {
  messageId: ReturnType<typeof parseMessageId>
  sequence: number
  streaming: boolean
  text: string
  threadId: ReturnType<typeof parseThreadId>
  turnId: ReturnType<typeof parseTurnId>
}): OrchestrationEvent {
  return {
    ...makeThreadEvent(threadId, sequence, `assistant-${sequence}`),
    payload: {
      attachments: [],
      createdAt: timestamp(sequence),
      messageId,
      role: 'assistant',
      streaming,
      text,
      threadId,
      turnId,
      updatedAt: timestamp(sequence),
    },
    type: 'thread.message-sent',
  }
}

function providerFailureActivityEvent(
  threadId: ReturnType<typeof parseThreadId>,
  turnId: ReturnType<typeof parseTurnId>,
): OrchestrationEvent {
  return {
    ...makeThreadEvent(threadId, 3, 'provider-failure'),
    occurredAt: timestamp(5),
    payload: {
      activity: makeActivity(5, threadId, {
        kind: 'provider.turn.start.failed',
        payload: { detail: 'failed' },
        summary: 'Provider turn start failed',
        tone: 'error',
        turnId,
      }),
      threadId,
    },
    type: 'thread.activity-appended',
  }
}

function proposedPlanUpsertedEvent(
  threadId: ReturnType<typeof parseThreadId>,
  planId: ReturnType<typeof parseProposedPlanId>,
  sequence: number,
): OrchestrationEvent {
  return {
    ...makeThreadEvent(threadId, sequence, `plan-${sequence}`),
    payload: {
      proposedPlan: makeProposedPlan({ id: planId, threadId }),
      threadId,
    },
    type: 'thread.proposed-plan-upserted',
  }
}

function turnDiffCompletedEvent(
  threadId: ReturnType<typeof parseThreadId>,
  turnId: ReturnType<typeof parseTurnId>,
  sequence: number,
): OrchestrationEvent {
  return {
    ...makeThreadEvent(threadId, sequence, `turn-diff-${sequence}`),
    payload: {
      ...makeCheckpoint(turnId),
      threadId,
    },
    type: 'thread.turn-diff-completed',
  }
}

function turnStartRequestedEvent(
  threadId: ReturnType<typeof parseThreadId>,
  turnId: ReturnType<typeof parseTurnId>,
  planId: ReturnType<typeof parseProposedPlanId>,
): OrchestrationEvent {
  return {
    ...makeThreadEvent(threadId, 2, 'turn-start'),
    payload: {
      createdAt: timestamp(2),
      interactionMode: DEFAULT_INTERACTION_MODE,
      messageId: parseMessageId('message-user'),
      runtimeMode: DEFAULT_RUNTIME_MODE,
      sourceProposedPlan: { planId, threadId },
      threadId,
      turnId,
    },
    type: 'thread.turn-start-requested',
  }
}

function parseProjectId(value: string) {
  return v.parse(projectIdSchema, value)
}

function parseThreadId(value: string) {
  return v.parse(threadIdSchema, value)
}

function parseMessageId(value: string) {
  return v.parse(messageIdSchema, value)
}

function parseEventId(value: string) {
  return v.parse(eventIdSchema, value)
}

function parseCommandId(value: string) {
  return v.parse(commandIdSchema, value)
}

function parseTurnId(value: string) {
  return v.parse(turnIdSchema, value)
}

function parseProposedPlanId(value: string) {
  return v.parse(proposedPlanIdSchema, value)
}

function timestamp(index: number) {
  return `2026-05-24T00:00:${String(index).padStart(2, '0')}.000Z`
}
