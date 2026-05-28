import { describe, expect, it } from 'bun:test'
import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_PROVIDER_INSTANCE_ID,
  DEFAULT_RUNTIME_MODE,
  commandIdSchema,
  eventIdSchema,
  messageIdSchema,
  projectIdSchema,
  threadIdSchema,
  turnIdSchema,
  type OrchestrationEvent,
  type OrchestrationMessage,
  type OrchestrationProjectShell,
  type OrchestrationThread,
  type OrchestrationThreadActivity,
  type OrchestrationThreadShell,
} from '@workspace/contracts'
import * as v from 'valibot'

import { CHAT_ACTIVITY_CACHE_LIMIT, CHAT_MESSAGE_CACHE_LIMIT } from './chat-cache-constants'
import { createInitialChatProjectionState } from './chat-projection-store'
import {
  applyChatProjectionEvent,
  applyChatProjectionShellStreamItem,
  syncChatProjectionShellSnapshot,
  syncChatProjectionThreadDetailSnapshot,
} from './chat-projection-writers'

describe('chat projection writers', () => {
  it('preserves existing detail for threads still present in a shell snapshot', () => {
    const threadId = parseThreadId('thread-1')
    const message = makeMessage(1, threadId)
    let state = createInitialChatProjectionState()

    state = syncChatProjectionThreadDetailSnapshot(state, {
      snapshotSequence: 1,
      thread: makeThreadDetail({ id: threadId, messages: [message], title: 'detail title' }),
    })
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

  it('removes all thread-scoped state when the shell removes a thread', () => {
    const threadId = parseThreadId('thread-1')
    const otherThreadId = parseThreadId('thread-2')
    let state = createInitialChatProjectionState()

    state = syncChatProjectionShellSnapshot(state, {
      projects: [makeProject()],
      snapshotSequence: 1,
      threads: [makeThreadShell({ id: threadId }), makeThreadShell({ id: otherThreadId })],
      updatedAt: timestamp(1),
    })
    state = syncChatProjectionThreadDetailSnapshot(state, {
      snapshotSequence: 2,
      thread: makeThreadDetail({
        activities: [makeActivity(1, threadId)],
        id: threadId,
        messages: [makeMessage(1, threadId)],
      }),
    })
    state = applyChatProjectionShellStreamItem(state, {
      kind: 'thread-removed',
      sequence: 3,
      threadId,
    })

    expect(state.threadIds).toEqual([otherThreadId])
    expect(state.threadShellById[threadId]).toBeUndefined()
    expect(state.threadSessionById[threadId]).toBeUndefined()
    expect(state.messageIdsByThreadId[threadId]).toBeUndefined()
    expect(state.activityIdsByThreadId[threadId]).toBeUndefined()
    expect(state.sidebarThreadSummaryById[threadId]).toBeUndefined()
    expect(state.threadIdsByProjectId[parseProjectId('project-1')]).toEqual([otherThreadId])
  })

  it('applies a detail snapshot only to the target thread detail slices', () => {
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
    state = syncChatProjectionThreadDetailSnapshot(state, {
      snapshotSequence: 2,
      thread: makeThreadDetail({ id: otherThreadId, messages: [otherMessage] }),
    })
    const otherThreadTitleBeforeTargetDetail = state.threadShellById[otherThreadId]?.title
    state = syncChatProjectionThreadDetailSnapshot(state, {
      snapshotSequence: 3,
      thread: makeThreadDetail({
        id: threadId,
        messages: [makeMessage(1, threadId)],
        title: 'detail thread',
      }),
    })

    expect(state.messageIdsByThreadId[otherThreadId]).toEqual([otherMessage.id])
    expect(state.threadShellById[otherThreadId]?.title).toBe(otherThreadTitleBeforeTargetDetail)
    expect(state.sidebarThreadSummaryById[threadId]?.title).toBe('shell thread')
    expect(state.threadShellById[threadId]?.title).toBe('detail thread')
  })

  it('trims message and activity detail arrays deterministically', () => {
    const threadId = parseThreadId('thread-1')
    const messages = Array.from({ length: CHAT_MESSAGE_CACHE_LIMIT + 5 }, (_, index) =>
      makeMessage(index, threadId),
    )
    const activities = Array.from({ length: CHAT_ACTIVITY_CACHE_LIMIT + 5 }, (_, index) =>
      makeActivity(index, threadId),
    )

    const state = syncChatProjectionThreadDetailSnapshot(createInitialChatProjectionState(), {
      snapshotSequence: 1,
      thread: makeThreadDetail({ activities, id: threadId, messages }),
    })

    expect(state.messageIdsByThreadId[threadId]).toHaveLength(CHAT_MESSAGE_CACHE_LIMIT)
    expect(state.activityIdsByThreadId[threadId]).toHaveLength(CHAT_ACTIVITY_CACHE_LIMIT)
    expect(state.messageIdsByThreadId[threadId]?.[0]).toBe(messages[5]?.id)
    expect(state.activityIdsByThreadId[threadId]?.[0]).toBe(activities[5]?.id)
  })

  it('ignores stale shell and detail snapshots', () => {
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
    state = syncChatProjectionThreadDetailSnapshot(state, {
      snapshotSequence: 6,
      thread: makeThreadDetail({
        id: threadId,
        messages: [makeMessage(6, threadId)],
        title: 'new thread',
      }),
    })
    state = syncChatProjectionThreadDetailSnapshot(state, {
      snapshotSequence: 5,
      thread: makeThreadDetail({ id: threadId, messages: [makeMessage(5, threadId)] }),
    })

    expect(state.projectById[parseProjectId('project-1')]?.title).toBe('new project')
    expect(state.threadShellById[threadId]?.title).toBe('new thread')
    expect(state.messageIdsByThreadId[threadId]).toEqual([parseMessageId('message-6')])
  })

  it('applies equal-sequence detail snapshots as authoritative detail state', () => {
    const threadId = parseThreadId('thread-1')
    const message = makeMessage(6, threadId)
    let state = createInitialChatProjectionState()

    state = syncChatProjectionThreadDetailSnapshot(state, {
      snapshotSequence: 6,
      thread: makeThreadDetail({ id: threadId, messages: [] }),
    })
    state = syncChatProjectionThreadDetailSnapshot(state, {
      snapshotSequence: 6,
      thread: makeThreadDetail({ id: threadId, messages: [message] }),
    })

    expect(state.messageIdsByThreadId[threadId]).toEqual([message.id])
    expect(state.messageByThreadId[threadId]?.[message.id]?.text).toBe(message.text)
  })

  it('keeps sidebar summaries shell-owned while detail events update local turn state', () => {
    const threadId = parseThreadId('thread-1')
    const turnId = parseTurnId('turn-1')
    let state = createInitialChatProjectionState()

    state = syncChatProjectionShellSnapshot(state, {
      projects: [makeProject()],
      snapshotSequence: 1,
      threads: [
        makeThreadShell({
          id: threadId,
          latestTurn: {
            assistantMessageId: null,
            completedAt: null,
            requestedAt: timestamp(1),
            startedAt: null,
            state: 'running',
            turnId,
          },
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

  it('marks live provider turn failures as terminal in local turn state', () => {
    const threadId = parseThreadId('thread-1')
    const turnId = parseTurnId('turn-1')
    let state = createInitialChatProjectionState()

    state = syncChatProjectionShellSnapshot(state, {
      projects: [makeProject()],
      snapshotSequence: 1,
      threads: [
        makeThreadShell({
          id: threadId,
          latestTurn: {
            assistantMessageId: null,
            completedAt: null,
            requestedAt: timestamp(1),
            startedAt: null,
            state: 'running',
            turnId,
          },
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

  it('projects streamed assistant deltas before completion without duplicating text', () => {
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
          latestTurn: {
            assistantMessageId: null,
            completedAt: null,
            requestedAt: timestamp(1),
            startedAt: timestamp(1),
            state: 'running',
            turnId,
          },
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
      assistantMessageEvent({
        messageId,
        sequence: 4,
        streaming: false,
        text: '',
        threadId,
        turnId,
      }),
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
})

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

function assistantCompleteEvent(
  threadId: ReturnType<typeof parseThreadId>,
  turnId: ReturnType<typeof parseTurnId>,
): OrchestrationEvent {
  return {
    actorKind: 'provider',
    aggregateId: threadId,
    aggregateKind: 'thread',
    causationEventId: null,
    commandId: parseCommandId('command-assistant-complete'),
    correlationId: parseCommandId('command-assistant-complete'),
    eventId: parseEventId('event-assistant-complete'),
    metadata: {},
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
    sequence: 2,
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
    actorKind: 'provider',
    aggregateId: threadId,
    aggregateKind: 'thread',
    causationEventId: null,
    commandId: parseCommandId(`command-assistant-${sequence}`),
    correlationId: parseCommandId(`command-assistant-${sequence}`),
    eventId: parseEventId(`event-assistant-${sequence}`),
    metadata: {},
    occurredAt: timestamp(sequence),
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
    sequence,
    type: 'thread.message-sent',
  }
}

function providerFailureActivityEvent(
  threadId: ReturnType<typeof parseThreadId>,
  turnId: ReturnType<typeof parseTurnId>,
): OrchestrationEvent {
  return {
    actorKind: 'provider',
    aggregateId: threadId,
    aggregateKind: 'thread',
    causationEventId: null,
    commandId: parseCommandId('command-provider-failure'),
    correlationId: parseCommandId('command-provider-failure'),
    eventId: parseEventId('event-provider-failure'),
    metadata: {},
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
    sequence: 3,
    type: 'thread.activity-appended',
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

function timestamp(index: number) {
  return `2026-05-24T00:00:${String(index).padStart(2, '0')}.000Z`
}
