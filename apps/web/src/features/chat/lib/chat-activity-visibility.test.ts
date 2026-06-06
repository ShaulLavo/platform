import { describe, expect, it } from 'vitest'

import { visibleActivityGroupRows } from './chat-activity-visibility'
import type { ChatWorkLogEntry, ChatWorkLogTone } from './chat-work-log'

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

function activity(id: string, tone: ChatWorkLogTone): ChatWorkLogEntry {
  return {
    createdAt: '2026-05-28T00:00:00.000Z',
    detail: null,
    icon: tone === 'thinking' ? 'thinking' : 'tool',
    id,
    itemType: tone === 'tool' ? 'command_execution' : null,
    status: null,
    title: tone,
    tone,
  }
}
