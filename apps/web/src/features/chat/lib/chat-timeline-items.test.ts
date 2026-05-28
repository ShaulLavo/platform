import { describe, expect, it } from 'bun:test'
import {
  commandIdSchema,
  eventIdSchema,
  messageIdSchema,
  proposedPlanIdSchema,
  threadIdSchema,
  turnIdSchema,
  type OrchestrationLatestTurn,
  type OrchestrationMessage,
  type OrchestrationProposedPlan,
  type OrchestrationThreadActivity,
} from '@workspace/contracts'
import * as v from 'valibot'

import type { OptimisticChatMessage } from '../state/chat-optimistic-store'
import { chatTimelineItems } from './chat-timeline-items'

describe('chat timeline items', () => {
  it('orders messages, optimistic messages, activities, and working state by timestamp', () => {
    const threadId = v.parse(threadIdSchema, 'thread-1')
    const turnId = v.parse(turnIdSchema, 'turn-1')
    const latestTurn: OrchestrationLatestTurn = {
      assistantMessageId: null,
      completedAt: null,
      requestedAt: timestamp(4),
      startedAt: timestamp(4),
      state: 'running',
      turnId,
    }
    const items = chatTimelineItems({
      activities: [activity('event-1', threadId, timestamp(3), turnId)],
      latestTurn,
      messages: [message('message-1', threadId, timestamp(1), 'user')],
      optimisticMessages: [optimisticMessage('message-2', threadId, timestamp(2), turnId)],
      proposedPlans: [proposedPlan('plan-1', threadId, timestamp(5), turnId)],
    })

    expect(items.map((item) => item.id)).toEqual([
      'message:message-1',
      'message:message-2',
      'activity-group:event-1',
      'proposed-plan:plan-1',
      'working:turn-1',
    ])
  })

  it('drops optimistic messages once the server message has arrived', () => {
    const threadId = v.parse(threadIdSchema, 'thread-1')
    const turnId = v.parse(turnIdSchema, 'turn-1')
    const resolved = optimisticMessage('message-1', threadId, timestamp(1), turnId)
    const items = chatTimelineItems({
      activities: [],
      latestTurn: null,
      messages: [message('message-1', threadId, timestamp(2), 'user')],
      optimisticMessages: [resolved],
      proposedPlans: [],
    })

    expect(items.map((item) => item.id)).toEqual(['message:message-1'])
  })

  it('uses proposed-plan ids as stable replay keys', () => {
    const threadId = v.parse(threadIdSchema, 'thread-1')
    const turnId = v.parse(turnIdSchema, 'turn-1')
    const items = chatTimelineItems({
      activities: [],
      latestTurn: null,
      messages: [],
      optimisticMessages: [],
      proposedPlans: [proposedPlan('plan-1', threadId, timestamp(1), turnId)],
    })

    expect(items.map((item) => item.id)).toEqual(['proposed-plan:plan-1'])
  })

  it('keeps T3 chronological tie order across messages, plans, and work', () => {
    const threadId = v.parse(threadIdSchema, 'thread-1')
    const turnId = v.parse(turnIdSchema, 'turn-1')
    const sameTime = timestamp(1)
    const items = chatTimelineItems({
      activities: [activity('event-1', threadId, sameTime, turnId)],
      latestTurn: null,
      messages: [message('message-1', threadId, sameTime, 'assistant')],
      optimisticMessages: [],
      proposedPlans: [proposedPlan('plan-1', threadId, sameTime, turnId, timestamp(2))],
    })

    expect(items.map((item) => item.id)).toEqual([
      'message:message-1',
      'proposed-plan:plan-1',
      'activity-group:event-1',
    ])
    expect(items[1]?.timestamp).toBe(sameTime)
  })

  it('groups only consecutive activities after chronological ordering', () => {
    const threadId = v.parse(threadIdSchema, 'thread-1')
    const turnId = v.parse(turnIdSchema, 'turn-1')
    const items = chatTimelineItems({
      activities: [
        activity('event-1', threadId, timestamp(2), turnId),
        activity('event-2', threadId, timestamp(4), turnId),
      ],
      latestTurn: null,
      messages: [message('message-1', threadId, timestamp(1), 'user')],
      optimisticMessages: [],
      proposedPlans: [proposedPlan('plan-1', threadId, timestamp(3), turnId)],
    })

    expect(items.map((item) => item.id)).toEqual([
      'message:message-1',
      'activity-group:event-1',
      'proposed-plan:plan-1',
      'activity-group:event-2',
    ])
  })
})

function message(
  id: string,
  threadId: ReturnType<typeof parseThreadId>,
  createdAt: string,
  role: OrchestrationMessage['role'],
): OrchestrationMessage {
  return {
    attachments: [],
    createdAt,
    id: v.parse(messageIdSchema, id),
    role,
    streaming: false,
    text: id,
    threadId,
    turnId: null,
    updatedAt: createdAt,
  }
}

function optimisticMessage(
  id: string,
  threadId: ReturnType<typeof parseThreadId>,
  createdAt: string,
  turnId: ReturnType<typeof parseTurnId>,
): OptimisticChatMessage {
  return {
    ...message(id, threadId, createdAt, 'user'),
    commandId: v.parse(commandIdSchema, `command-${id}`),
    optimistic: true,
    turnId,
  }
}

function activity(
  id: string,
  threadId: ReturnType<typeof parseThreadId>,
  createdAt: string,
  turnId: ReturnType<typeof parseTurnId>,
): OrchestrationThreadActivity {
  return {
    createdAt,
    id: v.parse(eventIdSchema, id),
    kind: 'tool',
    payload: null,
    summary: id,
    threadId,
    tone: 'tool',
    turnId,
  }
}

function proposedPlan(
  id: string,
  threadId: ReturnType<typeof parseThreadId>,
  createdAt: string,
  turnId: ReturnType<typeof parseTurnId>,
  updatedAt = createdAt,
): OrchestrationProposedPlan {
  return {
    createdAt,
    id: v.parse(proposedPlanIdSchema, id),
    planMarkdown: '- Do the work',
    threadId,
    turnId,
    updatedAt,
  }
}

function parseThreadId(value: string) {
  return v.parse(threadIdSchema, value)
}

function parseTurnId(value: string) {
  return v.parse(turnIdSchema, value)
}

function timestamp(index: number) {
  return `2026-05-24T12:00:0${index}.000Z`
}
