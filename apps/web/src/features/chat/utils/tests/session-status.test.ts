import { sessionStatus } from '@/features/chat/utils/session-status'
import { projectionSession } from '../../../../../test/factories/chat'
import { expect, test } from '../../../../../test/fixtures'

test('status follows the authoritative attention projection', () => {
  for (const attentionState of ['needs-input', 'working', 'settled'] as const) {
    expect(sessionStatus(projectionSession({ attentionState }))).toBe(attentionState)
  }
})

test('an acknowledged retained error does not change attention state', () => {
  expect(sessionStatus(projectionSession({ attentionState: 'settled', hasError: true }))).toBe(
    'settled',
  )
})
