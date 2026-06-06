import { describe, expect, it } from 'vitest'
import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_PROVIDER_INSTANCE_ID,
  DEFAULT_RUNTIME_MODE,
  eventIdSchema,
  messageIdSchema,
  projectIdSchema,
  threadIdSchema,
  turnIdSchema,
  type MessageId,
  type OrchestrationEvent,
  type OrchestrationMessage,
  type OrchestrationThreadDetailSnapshot,
  type ThreadId,
} from '@workspace/contracts'
import * as v from 'valibot'

import type { ChatEnvironment } from '../../environment/chat-environment'
import { useChatProjectionStore } from '../../state/chat-projection-store'
import {
  replayAfterDraftTurnDispatch,
  replayAfterTurnDispatch,
  syncThreadProjectionAfterDispatch,
} from '../chat-command-sync'

describe('chat command sync', () => {
  it('replays accepted thread events into the projection store', async () => {
    const threadId = v.parse(threadIdSchema, 'thread-1')
    const messageId = v.parse(messageIdSchema, 'message-1')
    const event = messageSentEvent({ messageId, sequence: 10, threadId })
    const environment = {
      replayEvents: async () => ({ events: [event] }),
      threadDetailSnapshot: async () =>
        threadDetailSnapshot({
          messages: [],
          sequence: 9,
          threadId,
        }),
    } as ChatEnvironment

    useChatProjectionStore.getState().resetChatProjection()
    await syncThreadProjectionAfterDispatch({
      environment,
      replayAfterSequence: 8,
      threadId,
    })

    expect(
      useChatProjectionStore.getState().messageByThreadId[threadId]?.[messageId],
    ).toMatchObject({
      id: messageId,
      text: 'Hello',
    })
  })

  it('syncs the authoritative thread detail snapshot when replay is unavailable', async () => {
    const threadId = v.parse(threadIdSchema, 'thread-1')
    const messageId = v.parse(messageIdSchema, 'message-1')
    const environment = {
      replayEvents: async () => {
        throw new Error('replay unavailable')
      },
      threadDetailSnapshot: async () =>
        threadDetailSnapshot({
          messages: [message({ messageId, threadId })],
          sequence: 10,
          threadId,
        }),
    } as ChatEnvironment

    useChatProjectionStore.getState().resetChatProjection()
    await syncThreadProjectionAfterDispatch({
      environment,
      replayAfterSequence: 8,
      threadId,
    })

    expect(
      useChatProjectionStore.getState().messageByThreadId[threadId]?.[messageId],
    ).toMatchObject({
      id: messageId,
      text: 'Hello',
    })
  })

  it('computes replay windows for turn and draft-thread dispatches', () => {
    expect(replayAfterTurnDispatch({ deduped: false, sequence: 12 })).toBe(10)
    expect(replayAfterDraftTurnDispatch({ deduped: false, sequence: 12 })).toBe(9)
  })
})

function messageSentEvent({
  messageId,
  sequence,
  threadId,
}: {
  messageId: MessageId
  sequence: number
  threadId: ThreadId
}): OrchestrationEvent {
  const turnId = v.parse(turnIdSchema, 'turn-1')

  return {
    actorKind: 'client',
    aggregateId: threadId,
    aggregateKind: 'thread',
    causationEventId: null,
    commandId: null,
    correlationId: null,
    eventId: v.parse(eventIdSchema, `event-${sequence}`),
    metadata: {},
    occurredAt: '2026-05-28T00:00:00.000Z',
    payload: {
      attachments: [],
      createdAt: '2026-05-28T00:00:00.000Z',
      messageId,
      role: 'user',
      streaming: false,
      text: 'Hello',
      threadId,
      turnId,
      updatedAt: '2026-05-28T00:00:00.000Z',
    },
    sequence,
    type: 'thread.message-sent',
  }
}

function threadDetailSnapshot({
  messages,
  sequence,
  threadId,
}: {
  messages: OrchestrationMessage[]
  sequence: number
  threadId: ThreadId
}): OrchestrationThreadDetailSnapshot {
  return {
    snapshotSequence: sequence,
    thread: {
      activities: [],
      archivedAt: null,
      branch: null,
      createdAt: timestamp(0),
      deletedAt: null,
      id: threadId,
      interactionMode: DEFAULT_INTERACTION_MODE,
      latestTurn: null,
      messages,
      modelSelection: {
        model: 'codex-test',
        providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
      },
      projectId: v.parse(projectIdSchema, 'project-1'),
      runtimeMode: DEFAULT_RUNTIME_MODE,
      session: null,
      title: 'Thread',
      updatedAt: timestamp(sequence),
      worktreePath: null,
    },
  }
}

function message({
  messageId,
  threadId,
}: {
  messageId: MessageId
  threadId: ThreadId
}): OrchestrationMessage {
  return {
    attachments: [],
    createdAt: timestamp(10),
    id: messageId,
    role: 'user',
    streaming: false,
    text: 'Hello',
    threadId,
    turnId: v.parse(turnIdSchema, 'turn-1'),
    updatedAt: timestamp(10),
  }
}

function timestamp(index: number) {
  return `2026-05-28T00:00:${String(index).padStart(2, '0')}.000Z`
}
