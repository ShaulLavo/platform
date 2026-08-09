import { createClientError } from '@/lib/structured-errors'
import {
  isBlockedStreamError,
  STREAM_RECONNECT_DELAYS_MS,
  streamReconnectDelayMs,
} from '@/features/chat/utils/stream-reconnect'
import { expect, test } from '../../../../../test/fixtures'

test('the ladder grows with each failure and saturates at its last rung', () => {
  const climbed = [1, 2, 3, 4, 5, 6, 7, 8, 99].map(streamReconnectDelayMs)

  expect(climbed).toEqual([250, 500, 1_000, 2_000, 4_000, 8_000, 16_000, 16_000, 16_000])
  expect(streamReconnectDelayMs(0)).toBe(STREAM_RECONNECT_DELAYS_MS[0])
})

test('rejected and missing resources are blocked, transport drops are not', () => {
  expect(isBlockedStreamError(failure(401))).toBe(true)
  expect(isBlockedStreamError(failure(403))).toBe(true)
  expect(isBlockedStreamError(failure(404))).toBe(true)
  expect(isBlockedStreamError(failure(502))).toBe(false)
  expect(isBlockedStreamError(failure(504))).toBe(false)
  expect(isBlockedStreamError('socket closed')).toBe(false)
})

function failure(status: number) {
  return createClientError({
    code: 'TEST_STREAM_FAILURE',
    message: `Stream failed with ${status}.`,
    status,
    why: 'A test stream failure.',
    fix: 'None.',
  })
}
