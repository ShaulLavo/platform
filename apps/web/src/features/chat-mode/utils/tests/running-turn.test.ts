import { threadIdSchema, turnIdSchema, type OrchestrationSessionStatus } from '@workspace/contracts'
import * as v from 'valibot'

import type { ProjectionThread } from '@/features/chat/state/chat-projection-store'
import { hasRunningTurn } from '@/features/chat-mode/utils/running-turn'
import { projectionThread } from '../../../../../test/factories/chat'
import { expect, test } from '../../../../../test/fixtures'

const threadId = v.parse(threadIdSchema, 'thread-1')
const activeTurnId = v.parse(turnIdSchema, 'turn-1')

test('a session actively producing a turn is running', () => {
  expect(hasRunningTurn(thread('running'))).toBe(true)
})

test('a session parked mid-work still holds its turn open', () => {
  // Compaction, or an approval nobody has answered. The turn has not ended, so
  // the archive guard must still refuse — before the status enum was unified
  // this state arrived here spelled `running`.
  expect(hasRunningTurn(thread('waiting'))).toBe(true)
})

test('a settled session does not become running because the predicate loosened', () => {
  expect(hasRunningTurn(thread('ready'))).toBe(false)
})

function thread(status: OrchestrationSessionStatus): ProjectionThread {
  return projectionThread({
    // Null, so the assertion rests on the session status rather than on a turn
    // that already reports itself as running.
    latestTurn: null,
    session: {
      activeTurnId,
      lastError: null,
      providerName: 'mock',
      providerSessionId: null,
      runtimeMode: 'approval-required',
      status,
      threadId,
      updatedAt: '2026-05-28T00:00:00.000Z',
    },
  })
}
