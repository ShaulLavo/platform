import {
  commandIdSchema,
  messageIdSchema,
  threadIdSchema,
  type OrchestrationMessage,
} from '@workspace/contracts'
import * as v from 'valibot'

import { useChatOptimisticStore } from '../chat-optimistic-store'
import { expect, test } from '../../../../../test/fixtures'

// The store is a module singleton with no reset export, so each case owns a
// thread id nobody else touches.
test('clearResolvedOptimisticMessages does nothing for a thread with no optimistic messages', () => {
  const threadId = v.parse(threadIdSchema, 'optimistic-untouched')
  const before = useChatOptimisticStore.getState().messagesByThreadId

  useChatOptimisticStore.getState().clearResolvedOptimisticMessages(threadId, [])

  // A regression guard, not proof the early return ran: zustand already no-ops
  // when the updater returns the same state object, which is what the old code
  // did. The bail itself is proven by the code shape.
  expect(useChatOptimisticStore.getState().messagesByThreadId).toBe(before)
})

test('clearResolvedOptimisticMessages drops an optimistic message the server has echoed', () => {
  const threadId = v.parse(threadIdSchema, 'optimistic-echoed')
  const message = optimisticMessage(threadId)

  useChatOptimisticStore
    .getState()
    .addOptimisticMessage(v.parse(commandIdSchema, 'command-echoed'), message)
  useChatOptimisticStore.getState().clearResolvedOptimisticMessages(threadId, [message])

  // `replaceThreadMessages` drops the thread key once the last optimistic
  // message resolves, which is what makes the bail above the common case.
  expect(useChatOptimisticStore.getState().messagesByThreadId[threadId]).toBeUndefined()
})

function optimisticMessage(threadId: ReturnType<typeof v.parse<typeof threadIdSchema>>) {
  return {
    attachments: [],
    createdAt: '2026-05-24T12:00:00.000Z',
    id: v.parse(messageIdSchema, 'message-echoed'),
    role: 'user',
    streaming: false,
    text: 'hello',
    threadId,
    turnId: null,
    updatedAt: '2026-05-24T12:00:00.000Z',
  } satisfies OrchestrationMessage
}
