import { describe, expect, it } from 'bun:test'
import {
  eventIdSchema,
  threadIdSchema,
  turnIdSchema,
  type OrchestrationThreadActivity,
} from '@workspace/contracts'
import * as v from 'valibot'

import { visibleActivityGroupRows } from './chat-activity-visibility'

describe('chat activity visibility', () => {
  it('keeps thinking visible when the collapsed work log overflows', () => {
    const activities = [
      activity('thinking-1', 'thinking'),
      activity('tool-1', 'tool'),
      activity('tool-2', 'tool'),
      activity('tool-3', 'tool'),
      activity('tool-4', 'tool'),
    ]

    expect(visibleActivityGroupRows(activities, 3).map((item) => item.id)).toEqual([
      'thinking-1',
      'tool-3',
      'tool-4',
    ])
  })

  it('uses the latest rows when thinking is already visible', () => {
    const activities = [
      activity('tool-1', 'tool'),
      activity('tool-2', 'tool'),
      activity('thinking-1', 'thinking'),
    ]

    expect(visibleActivityGroupRows(activities, 2).map((item) => item.id)).toEqual([
      'tool-2',
      'thinking-1',
    ])
  })
})

function activity(
  id: string,
  tone: OrchestrationThreadActivity['tone'],
): OrchestrationThreadActivity {
  return {
    createdAt: '2026-05-28T00:00:00.000Z',
    id: v.parse(eventIdSchema, id),
    kind: tone === 'thinking' ? 'task.progress' : 'tool.completed',
    payload: null,
    summary: tone,
    threadId: v.parse(threadIdSchema, 'thread-1'),
    tone,
    turnId: v.parse(turnIdSchema, 'turn-1'),
  }
}
