import {
  eventIdSchema,
  threadIdSchema,
  type OrchestrationThreadActivity,
} from '@workspace/contracts'
import * as v from 'valibot'

import {
  CONTEXT_WINDOW_ACTIVITY_KIND,
  contextUsageForActivities,
  contextUsageForPayload,
  formatContextTokens,
} from '@/features/chat/lib/context-usage'
import { expect, test } from '../../../../../test/fixtures'

test('reads the used and maximum token counts a provider reports', () => {
  const usage = contextUsageForPayload({
    compactsAutomatically: true,
    maxTokens: 200_000,
    totalProcessedTokens: 500_000,
    usedTokens: 50_000,
  })

  expect(usage).toEqual({
    compactsAutomatically: true,
    maxTokens: 200_000,
    ratio: 0.25,
    totalProcessedTokens: 500_000,
    usedTokens: 50_000,
  })
})

test('has nothing to show without a window size to divide by', () => {
  // Claude's per-turn result usage looks exactly like this.
  expect(contextUsageForPayload({ input_tokens: 10, usedTokens: 4200 })).toBeNull()
  expect(contextUsageForPayload({ maxTokens: 200_000 })).toBeNull()
  expect(contextUsageForPayload(null)).toBeNull()
})

test('clamps a provider that over-reports rather than painting past full', () => {
  expect(contextUsageForPayload({ maxTokens: 100, usedTokens: 250 })?.ratio).toBe(1)
})

test('takes the newest snapshot that carries a window size', () => {
  const usage = contextUsageForActivities([
    activity(1, { maxTokens: 200_000, usedTokens: 10_000 }),
    activity(2, { maxTokens: 200_000, usedTokens: 90_000 }),
    // A later per-turn snapshot with no window must not blank the gauge.
    activity(3, { usedTokens: 1_200 }),
  ])

  expect(usage?.usedTokens).toBe(90_000)
})

test('ignores activities that are not context-window snapshots', () => {
  const unrelated: OrchestrationThreadActivity = {
    ...activity(1, { maxTokens: 200_000, usedTokens: 10 }),
    kind: 'context-compaction',
  }

  expect(contextUsageForActivities([unrelated])).toBeNull()
})

test('abbreviates token counts for a gauge that has no room', () => {
  expect(formatContextTokens(940)).toBe('940')
  expect(formatContextTokens(12_400)).toBe('12.4k')
  expect(formatContextTokens(200_000)).toBe('200k')
  expect(formatContextTokens(1_250_000)).toBe('1.3M')
})

function activity(index: number, payload: unknown): OrchestrationThreadActivity {
  return {
    createdAt: `2026-05-28T00:00:0${index}.000Z`,
    id: v.parse(eventIdSchema, `event-${index}`),
    kind: CONTEXT_WINDOW_ACTIVITY_KIND,
    payload,
    summary: 'Context window updated',
    threadId: v.parse(threadIdSchema, 'thread-1'),
    tone: 'info',
    turnId: null,
  }
}
