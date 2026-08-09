import {
  ORCHESTRATION_THREAD_DETAIL_PAGE_SIZE,
  orchestrationEventSchema,
  threadIdSchema,
  type OrchestrationMessage,
  type OrchestrationThreadDetailPage,
  type OrchestrationThreadDetailSnapshot,
} from '@workspace/contracts'
import * as v from 'valibot'

import { CHAT_MESSAGE_CACHE_LIMIT } from '../chat-cache-constants'
import { createInitialChatProjectionState } from '../chat-projection-store'
import {
  chatThreadEarlierPageInput,
  selectChatThreadHasEarlier,
} from '../chat-projection-selectors'
import {
  applyChatProjectionEvent,
  prependChatProjectionThreadDetailPage,
  syncChatProjectionThreadDetailSnapshot,
} from '../chat-projection-writers'
import { chatMessage, thread as threadFactory } from '../../../../../test/factories/chat'
import { expect, test } from '../../../../../test/fixtures'

const THREAD_ID = v.parse(threadIdSchema, 'thread-1')

test('a full detail window leaves earlier rows on the table, a short one does not', () => {
  const full = syncChatProjectionThreadDetailSnapshot(
    createInitialChatProjectionState(),
    detailSnapshot(windowMessages(ORCHESTRATION_THREAD_DETAIL_PAGE_SIZE)),
  )
  const short = syncChatProjectionThreadDetailSnapshot(
    createInitialChatProjectionState(),
    detailSnapshot(windowMessages(3)),
  )

  expect(selectChatThreadHasEarlier(full, THREAD_ID)).toBe(true)
  expect(selectChatThreadHasEarlier(short, THREAD_ID)).toBe(false)
})

test('an unopened thread offers the page rather than hiding reachable history', () => {
  expect(selectChatThreadHasEarlier(createInitialChatProjectionState(), THREAD_ID)).toBe(true)
})

test('the page request boundary is the oldest row the store still holds', () => {
  let state = syncChatProjectionThreadDetailSnapshot(
    createInitialChatProjectionState(),
    detailSnapshot([message(100), message(101)]),
  )

  expect(chatThreadEarlierPageInput(state, THREAD_ID)).toEqual({
    beforeActivity: null,
    beforeMessage: { createdAt: createdAt(100), id: 'message-100' },
    threadId: THREAD_ID,
  })

  state = prependChatProjectionThreadDetailPage(state, page([message(98), message(99)], true))

  expect(chatThreadEarlierPageInput(state, THREAD_ID)).toEqual({
    beforeActivity: null,
    beforeMessage: { createdAt: createdAt(98), id: 'message-98' },
    threadId: THREAD_ID,
  })
})

test('paging backwards prepends older turns in order and terminates on the last page', () => {
  let state = syncChatProjectionThreadDetailSnapshot(
    createInitialChatProjectionState(),
    detailSnapshot([message(4), message(5)]),
  )

  state = prependChatProjectionThreadDetailPage(state, page([message(2), message(3)], true))
  expect(selectChatThreadHasEarlier(state, THREAD_ID)).toBe(true)

  state = prependChatProjectionThreadDetailPage(state, page([message(0), message(1)], false))

  expect(state.messageIdsByThreadId[THREAD_ID]).toEqual([
    'message-0',
    'message-1',
    'message-2',
    'message-3',
    'message-4',
    'message-5',
  ])
  expect(selectChatThreadHasEarlier(state, THREAD_ID)).toBe(false)
})

test('a page that overlaps the window is idempotent instead of duplicating rows', () => {
  let state = syncChatProjectionThreadDetailSnapshot(
    createInitialChatProjectionState(),
    detailSnapshot([message(2), message(3)]),
  )

  state = prependChatProjectionThreadDetailPage(state, page([message(1), message(2)], false))
  state = prependChatProjectionThreadDetailPage(state, page([message(1), message(2)], false))

  expect(state.messageIdsByThreadId[THREAD_ID]).toEqual(['message-1', 'message-2', 'message-3'])
})

test('a live append that trims the front re-arms the page so trimmed rows stay reachable', () => {
  let state = syncChatProjectionThreadDetailSnapshot(
    createInitialChatProjectionState(),
    detailSnapshot(windowMessages(3)),
  )
  expect(selectChatThreadHasEarlier(state, THREAD_ID)).toBe(false)

  // Fill past the cache ceiling, then let one more live message trim the front.
  state = prependChatProjectionThreadDetailPage(
    state,
    page(
      Array.from({ length: CHAT_MESSAGE_CACHE_LIMIT }, (_, index) => message(1_000 + index)),
      false,
    ),
  )
  expect(selectChatThreadHasEarlier(state, THREAD_ID)).toBe(false)

  state = applyChatProjectionEvent(state, messageSentEvent(message(9_999), 42))

  expect(state.messageIdsByThreadId[THREAD_ID]).toHaveLength(CHAT_MESSAGE_CACHE_LIMIT + 3)
  expect(state.messageIdsByThreadId[THREAD_ID]?.[0]).toBe('message-1001')
  expect(selectChatThreadHasEarlier(state, THREAD_ID)).toBe(true)
  // The re-armed boundary points at the new oldest row, so the trimmed message
  // is exactly one page request away.
  expect(chatThreadEarlierPageInput(state, THREAD_ID).beforeMessage).toEqual({
    createdAt: createdAt(1_001),
    id: 'message-1001',
  })
})

function windowMessages(count: number) {
  return Array.from({ length: count }, (_, index) => message(index))
}

function message(index: number): OrchestrationMessage {
  return chatMessage({
    createdAt: createdAt(index),
    id: `message-${index}` as OrchestrationMessage['id'],
    threadId: THREAD_ID,
    updatedAt: createdAt(index),
  })
}

function createdAt(index: number) {
  return new Date(Date.UTC(2026, 4, 24) + index * 1_000).toISOString()
}

function detailSnapshot(messages: OrchestrationMessage[]): OrchestrationThreadDetailSnapshot {
  return {
    checkpoints: [],
    proposedPlans: [],
    snapshotSequence: 1,
    thread: { ...threadFactory({ id: THREAD_ID, messages }), deletedAt: null },
  }
}

function page(
  messages: OrchestrationMessage[],
  hasEarlier: boolean,
): OrchestrationThreadDetailPage {
  return {
    activities: [],
    hasEarlier,
    messages,
    snapshotSequence: 1,
    threadId: THREAD_ID,
  }
}

function messageSentEvent(message: OrchestrationMessage, sequence: number) {
  return v.parse(orchestrationEventSchema, {
    actorKind: 'client',
    aggregateId: THREAD_ID,
    aggregateKind: 'thread',
    causationEventId: null,
    commandId: null,
    correlationId: null,
    eventId: `event-${message.id}`,
    metadata: {},
    occurredAt: message.createdAt,
    payload: {
      attachments: [],
      createdAt: message.createdAt,
      messageId: message.id,
      role: message.role,
      streaming: false,
      text: message.text,
      threadId: THREAD_ID,
      turnId: null,
      updatedAt: message.updatedAt,
    },
    sequence,
    type: 'thread.message-sent',
  })
}
