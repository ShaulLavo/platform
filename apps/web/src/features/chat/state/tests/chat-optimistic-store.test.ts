import { TEST_ENVIRONMENT_ID as FIXTURE_ENVIRONMENT_ID } from '../../../../../test/factories/chat'
import {
  commandIdSchema,
  messageIdSchema,
  sessionIdSchema,
  type OrchestrationMessage,
} from '@workspace/contracts'
import * as v from 'valibot'

import { useChatOptimisticStore } from '../chat-optimistic-store'
import { expect, test } from '../../../../../test/fixtures'

// The store is a module singleton with no reset export, so each case owns a
// session id nobody else touches.
test('clearResolvedOptimisticMessages does nothing for a session with no optimistic messages', () => {
  const sessionId = v.parse(sessionIdSchema, 'ac85a2d7-26ab-59f4-99c4-fa593236511e')
  const before = useChatOptimisticStore.getState().messagesBySessionKey

  useChatOptimisticStore
    .getState()
    .clearResolvedOptimisticMessages({ environmentId: FIXTURE_ENVIRONMENT_ID, sessionId }, [])

  // A regression guard, not proof the early return ran: zustand already no-ops
  // when the updater returns the same state object, which is what the old code
  // did. The bail itself is proven by the code shape.
  expect(useChatOptimisticStore.getState().messagesBySessionKey).toBe(before)
})

test('clearResolvedOptimisticMessages drops an optimistic message the server has echoed', () => {
  const sessionId = v.parse(sessionIdSchema, '699e96c9-490f-5be0-af68-9fbe44bfdb2c')
  const message = optimisticMessage(sessionId)

  useChatOptimisticStore
    .getState()
    .addOptimisticMessage(
      FIXTURE_ENVIRONMENT_ID,
      v.parse(commandIdSchema, 'command-echoed'),
      message,
    )
  useChatOptimisticStore
    .getState()
    .clearResolvedOptimisticMessages({ environmentId: FIXTURE_ENVIRONMENT_ID, sessionId }, [
      message,
    ])

  // `replaceSessionMessages` drops the session key once the last optimistic
  // message resolves, which is what makes the bail above the common case.
  expect(
    useChatOptimisticStore.getState().messagesBySessionKey[
      `${FIXTURE_ENVIRONMENT_ID}:${sessionId}`
    ],
  ).toBeUndefined()
})

function optimisticMessage(sessionId: ReturnType<typeof v.parse<typeof sessionIdSchema>>) {
  return {
    attachments: [],
    createdAt: '2026-05-24T12:00:00.000Z',
    id: v.parse(messageIdSchema, 'message-echoed'),
    role: 'user',
    streaming: false,
    text: 'hello',
    sessionId,
    turnId: null,
    updatedAt: '2026-05-24T12:00:00.000Z',
  } satisfies OrchestrationMessage
}
