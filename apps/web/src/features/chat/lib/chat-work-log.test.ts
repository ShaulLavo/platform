import { describe, expect, it } from 'vitest'
import {
  eventIdSchema,
  threadIdSchema,
  turnIdSchema,
  type OrchestrationThreadActivity,
} from '@workspace/contracts'
import * as v from 'valibot'

import { chatWorkLogEntries } from './chat-work-log'

describe('chat work log entries', () => {
  it('matches T3 latest-turn filtering and lifecycle noise suppression', () => {
    const entries = chatWorkLogEntries({
      activities: [
        activity('old-turn', {
          createdAt: timestamp(1),
          kind: 'tool.completed',
          summary: 'Old tool completed',
          turnId: 'turn-1',
        }),
        activity('task-start', {
          createdAt: timestamp(2),
          kind: 'task.started',
          summary: 'Task started',
          tone: 'info',
          turnId: 'turn-2',
        }),
        activity('tool-start', {
          createdAt: timestamp(3),
          kind: 'tool.started',
          summary: 'Bash started',
          turnId: 'turn-2',
        }),
        activity('thinking', {
          createdAt: timestamp(4),
          kind: 'task.progress',
          payload: { summary: 'Inspecting repository state' },
          summary: 'Thinking',
          tone: 'thinking',
          turnId: 'turn-2',
        }),
      ],
      latestTurnId: v.parse(turnIdSchema, 'turn-2'),
    })

    expect(entries).toMatchObject([
      {
        id: 'thinking',
        title: 'Inspecting repository state',
        tone: 'thinking',
      },
    ])
  })

  it('collapses consecutive tool updates into the completed row', () => {
    const entries = chatWorkLogEntries({
      activities: [
        activity('tool-update', {
          createdAt: timestamp(1),
          kind: 'tool.updated',
          payload: { detail: 'bun test', itemType: 'command_execution' },
          summary: 'Bash updated',
          turnId: 'turn-1',
        }),
        activity('tool-complete', {
          createdAt: timestamp(2),
          kind: 'tool.completed',
          payload: { detail: 'bun test', itemType: 'command_execution' },
          summary: 'Bash completed',
          turnId: 'turn-1',
        }),
      ],
      latestTurnId: v.parse(turnIdSchema, 'turn-1'),
    })

    expect(entries).toMatchObject([
      {
        detail: 'bun test',
        id: 'tool-complete',
        itemType: 'command_execution',
        title: 'Bash',
        tone: 'tool',
      },
    ])
  })
})

function activity(id: string, overrides: ActivityOverrides): OrchestrationThreadActivity {
  const createdAt = overrides.createdAt ?? timestamp(1)
  return {
    createdAt,
    id: v.parse(eventIdSchema, id),
    kind: overrides.kind ?? 'tool.completed',
    payload: overrides.payload ?? null,
    summary: overrides.summary ?? id,
    threadId: v.parse(threadIdSchema, 'thread-1'),
    tone: overrides.tone ?? 'tool',
    turnId: overrides.turnId === null ? null : v.parse(turnIdSchema, overrides.turnId ?? 'turn-1'),
  }
}

type ActivityOverrides = Omit<Partial<OrchestrationThreadActivity>, 'turnId'> & {
  turnId?: string | null
}

function timestamp(index: number) {
  return `2026-05-24T12:00:0${index}.000Z`
}
