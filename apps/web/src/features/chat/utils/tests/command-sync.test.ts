import { TEST_ENVIRONMENT_ID as FIXTURE_ENVIRONMENT_ID } from '../../../../../test/factories/chat'
import { sessionShell as fixtureSessionShell } from '../../../../../test/factories/chat'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_PROVIDER_INSTANCE_ID,
  DEFAULT_RUNTIME_MODE,
  eventIdSchema,
  messageIdSchema,
  sessionIdSchema,
  turnIdSchema,
  type MessageId,
  type OrchestrationEvent,
  type OrchestrationMessage,
  type OrchestrationSessionDetailSnapshot,
  type SessionId,
} from '@workspace/contracts'
import * as v from 'valibot'

import { unsupportedChatTransport } from '../../../../../test/factories/chat-transport'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { syncSessionProjectionAfterDispatch } from '@/features/chat/utils/command-sync'

describe('chat command sync', () => {
  it('replays accepted session events into the projection store', async () => {
    const sessionId = v.parse(sessionIdSchema, 'ad686244-5b2e-59be-805f-ef86eac80feb')
    const messageId = v.parse(messageIdSchema, 'message-1')
    const event = messageSentEvent({ messageId, sequence: 10, sessionId })
    const transport = unsupportedChatTransport({
      replayEvents: async () => ({ events: [event] }),
      sessionDetailSnapshot: async () =>
        sessionDetailSnapshot({
          messages: [],
          sequence: 9,
          sessionId,
        }),
    })

    useChatProjectionStore.getState().resetChatProjection()
    await syncSessionProjectionAfterDispatch({
      transport,
      replayAfterSequence: 8,
      sessionId,
    })

    expect(
      useChatProjectionStore.getState().slices[FIXTURE_ENVIRONMENT_ID]!.messageBySessionId[
        sessionId
      ]?.[messageId],
    ).toMatchObject({
      id: messageId,
      text: 'Hello',
    })
  })

  it('syncs the authoritative session detail snapshot when replay is unavailable', async () => {
    const sessionId = v.parse(sessionIdSchema, 'ad686244-5b2e-59be-805f-ef86eac80feb')
    const messageId = v.parse(messageIdSchema, 'message-1')
    const transport = unsupportedChatTransport({
      replayEvents: async () => {
        throw new Error('replay unavailable')
      },
      sessionDetailSnapshot: async () =>
        sessionDetailSnapshot({
          messages: [message({ messageId, sessionId })],
          sequence: 10,
          sessionId,
        }),
    })

    useChatProjectionStore.getState().resetChatProjection()
    await syncSessionProjectionAfterDispatch({
      transport,
      replayAfterSequence: 8,
      sessionId,
    })

    expect(
      useChatProjectionStore.getState().slices[FIXTURE_ENVIRONMENT_ID]!.messageBySessionId[
        sessionId
      ]?.[messageId],
    ).toMatchObject({
      id: messageId,
      text: 'Hello',
    })
  })
})

function messageSentEvent({
  messageId,
  sequence,
  sessionId,
}: {
  messageId: MessageId
  sequence: number
  sessionId: SessionId
}): OrchestrationEvent {
  const turnId = v.parse(turnIdSchema, 'turn-1')

  return {
    actorKind: 'client',
    aggregateId: sessionId,
    aggregateKind: 'session',
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
      sessionId,
      turnId,
      updatedAt: '2026-05-28T00:00:00.000Z',
    },
    sequence,
    type: 'session.message-sent',
  }
}

function sessionDetailSnapshot({
  messages,
  sequence,
  sessionId,
}: {
  messages: OrchestrationMessage[]
  sequence: number
  sessionId: SessionId
}): OrchestrationSessionDetailSnapshot {
  return {
    checkpoints: [],
    proposedPlans: [],
    snapshotSequence: sequence,
    session: {
      deletion: null,
      ...fixtureSessionShell(),
      activities: [],
      archivedAt: null,

      createdAt: timestamp(0),
      deletedAt: null,
      id: sessionId,
      interactionMode: DEFAULT_INTERACTION_MODE,
      latestTurn: null,
      messages,
      modelSelection: {
        model: 'codex-test',
        providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
      },

      runtimeMode: DEFAULT_RUNTIME_MODE,
      runtime: null,
      title: 'Session',
      updatedAt: timestamp(sequence),
    },
  }
}

function message({
  messageId,
  sessionId,
}: {
  messageId: MessageId
  sessionId: SessionId
}): OrchestrationMessage {
  return {
    attachments: [],
    createdAt: timestamp(10),
    id: messageId,
    role: 'user',
    streaming: false,
    text: 'Hello',
    sessionId,
    turnId: v.parse(turnIdSchema, 'turn-1'),
    updatedAt: timestamp(10),
  }
}

function timestamp(index: number) {
  return `2026-05-28T00:00:${String(index).padStart(2, '0')}.000Z`
}
