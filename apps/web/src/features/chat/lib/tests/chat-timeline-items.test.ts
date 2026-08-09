import { describe, expect, it } from 'vitest'
import {
  commandIdSchema,
  eventIdSchema,
  messageIdSchema,
  proposedPlanIdSchema,
  threadIdSchema,
  turnIdSchema,
  type OrchestrationLatestTurn,
  type OrchestrationMessage,
  type OrchestrationProposedPlan,
  type OrchestrationThreadActivity,
} from '@workspace/contracts'
import * as v from 'valibot'

import type { OptimisticChatMessage } from '../../state/chat-optimistic-store'
import type { ChatTurnDiffSummary } from '../../state/chat-projection-store'
import { chatTimelineItems } from '../chat-timeline-items'

describe('chat timeline items', () => {
  it('orders messages, optimistic messages, activities, and working state by timestamp', () => {
    const threadId = v.parse(threadIdSchema, 'thread-1')
    const turnId = v.parse(turnIdSchema, 'turn-1')
    const latestTurn: OrchestrationLatestTurn = {
      assistantMessageId: null,
      completedAt: null,
      requestedAt: timestamp(4),
      startedAt: timestamp(4),
      state: 'running',
      turnId,
    }
    const items = chatTimelineItems({
      activities: [activity('event-1', threadId, timestamp(3), turnId)],
      latestTurn,
      messages: [message('message-1', threadId, timestamp(1), 'user')],
      optimisticMessages: [optimisticMessage('message-2', threadId, timestamp(2), turnId)],
      proposedPlans: [proposedPlan('plan-1', threadId, timestamp(5), turnId)],
    })

    expect(items.map((item) => item.id)).toEqual([
      'message:message-1',
      'message:message-2',
      'activity-group:event-1',
      'proposed-plan:plan-1',
      'working:turn-1',
    ])
  })

  it('drops optimistic messages once the server message has arrived', () => {
    const threadId = v.parse(threadIdSchema, 'thread-1')
    const turnId = v.parse(turnIdSchema, 'turn-1')
    const resolved = optimisticMessage('message-1', threadId, timestamp(1), turnId)
    const items = chatTimelineItems({
      activities: [],
      latestTurn: null,
      messages: [message('message-1', threadId, timestamp(2), 'user')],
      optimisticMessages: [resolved],
      proposedPlans: [],
    })

    expect(items.map((item) => item.id)).toEqual(['message:message-1'])
  })

  it('uses proposed-plan ids as stable replay keys', () => {
    const threadId = v.parse(threadIdSchema, 'thread-1')
    const turnId = v.parse(turnIdSchema, 'turn-1')
    const items = chatTimelineItems({
      activities: [],
      latestTurn: null,
      messages: [],
      optimisticMessages: [],
      proposedPlans: [proposedPlan('plan-1', threadId, timestamp(1), turnId)],
    })

    expect(items.map((item) => item.id)).toEqual(['proposed-plan:plan-1'])
  })

  it('keeps T3 chronological tie order across messages, plans, and work', () => {
    const threadId = v.parse(threadIdSchema, 'thread-1')
    const turnId = v.parse(turnIdSchema, 'turn-1')
    const sameTime = timestamp(1)
    const items = chatTimelineItems({
      activities: [activity('event-1', threadId, sameTime, turnId)],
      latestTurn: null,
      messages: [message('message-1', threadId, sameTime, 'assistant')],
      optimisticMessages: [],
      proposedPlans: [proposedPlan('plan-1', threadId, sameTime, turnId, timestamp(2))],
    })

    expect(items.map((item) => item.id)).toEqual([
      'message:message-1',
      'proposed-plan:plan-1',
      'activity-group:event-1',
    ])
    expect(items[1]?.timestamp).toBe(sameTime)
  })

  it('groups only consecutive activities after chronological ordering', () => {
    const threadId = v.parse(threadIdSchema, 'thread-1')
    const turnId = v.parse(turnIdSchema, 'turn-1')
    const items = chatTimelineItems({
      activities: [
        activity('event-1', threadId, timestamp(2), turnId),
        activity('event-2', threadId, timestamp(4), turnId),
      ],
      latestTurn: null,
      messages: [message('message-1', threadId, timestamp(1), 'user')],
      optimisticMessages: [],
      proposedPlans: [proposedPlan('plan-1', threadId, timestamp(3), turnId)],
    })

    expect(items.map((item) => item.id)).toEqual([
      'message:message-1',
      'activity-group:event-1',
      'proposed-plan:plan-1',
      'activity-group:event-2',
    ])
  })

  it('keeps older turns in the work log and groups them where they happened', () => {
    const threadId = v.parse(threadIdSchema, 'thread-1')
    const turnId = v.parse(turnIdSchema, 'turn-2')
    const latestTurn: OrchestrationLatestTurn = {
      assistantMessageId: null,
      completedAt: null,
      requestedAt: timestamp(5),
      startedAt: timestamp(5),
      state: 'running',
      turnId,
    }
    const items = chatTimelineItems({
      activities: [
        activity('old-turn-tool', threadId, timestamp(2), v.parse(turnIdSchema, 'turn-1')),
        activity('task-start', threadId, timestamp(3), turnId, 'task.started', 'info'),
        activity('thinking', threadId, timestamp(4), turnId, 'task.progress', 'thinking', {
          summary: 'Inspecting repository state',
        }),
      ],
      latestTurn,
      messages: [message('message-1', threadId, timestamp(1), 'user')],
      optimisticMessages: [],
      proposedPlans: [],
    })

    expect(items.map((item) => item.id)).toEqual([
      'message:message-1',
      'activity-group:old-turn-tool',
      'working:turn-2',
    ])
    expect(items[1]).toMatchObject({
      activities: [
        { title: 'old-turn-tool', turnId: 'turn-1' },
        { title: 'Inspecting repository state', tone: 'thinking', turnId: 'turn-2' },
      ],
    })
  })

  it('hands the running turn its plan so the working row can name the current step', () => {
    const threadId = v.parse(threadIdSchema, 'thread-1')
    const turnId = v.parse(turnIdSchema, 'turn-1')
    const latestTurn: OrchestrationLatestTurn = {
      assistantMessageId: null,
      completedAt: null,
      requestedAt: timestamp(1),
      startedAt: timestamp(1),
      state: 'running',
      turnId,
    }
    const items = chatTimelineItems({
      activities: [
        activity('plan-1', threadId, timestamp(2), turnId, 'turn.plan.updated', 'thinking', {
          plan: [
            { status: 'completed', step: 'Read the code' },
            { status: 'inProgress', step: 'Write the test' },
          ],
        }),
      ],
      latestTurn,
      messages: [],
      optimisticMessages: [],
      proposedPlans: [],
    })
    const workingItem = items.find((item) => item.type === 'working')

    expect(workingItem).toMatchObject({
      plan: { completedCount: 1, currentStep: 'Write the test' },
    })
  })

  it('derives T3 assistant row metadata before rendering', () => {
    const threadId = v.parse(threadIdSchema, 'thread-1')
    const turnId = v.parse(turnIdSchema, 'turn-1')
    const latestTurn: OrchestrationLatestTurn = {
      assistantMessageId: v.parse(messageIdSchema, 'message-3'),
      completedAt: timestamp(5),
      requestedAt: timestamp(1),
      startedAt: timestamp(2),
      state: 'completed',
      turnId,
    }
    const items = chatTimelineItems({
      activities: [activity('tool-done', threadId, timestamp(3), turnId)],
      latestTurn,
      messages: [
        message('message-1', threadId, timestamp(1), 'user'),
        message('message-2', threadId, timestamp(2), 'assistant', {
          text: 'First draft',
          turnId,
          updatedAt: timestamp(3),
        }),
        message('message-3', threadId, timestamp(4), 'assistant', {
          text: 'Final response',
          turnId,
          updatedAt: timestamp(5),
        }),
      ],
      optimisticMessages: [],
      proposedPlans: [],
    })
    const assistantItems = items.filter(
      (item) => item.type === 'message' && item.message.role === 'assistant',
    )

    expect(assistantItems).toHaveLength(2)
    expect(assistantItems[0]).toMatchObject({
      assistantStreaming: false,
      completionSummary: 'Worked for 3.0s',
      durationEnd: timestamp(3),
      durationStart: timestamp(1),
      showAssistantCopyButton: false,
      showCompletionDivider: false,
    })
    expect(assistantItems[1]).toMatchObject({
      assistantStreaming: false,
      completionSummary: 'Worked for 3.0s',
      durationEnd: timestamp(5),
      durationStart: timestamp(3),
      showAssistantCopyButton: true,
      showCompletionDivider: true,
    })
  })

  it('freezes terminal assistant metadata when raw message streaming lags turn completion', () => {
    const threadId = v.parse(threadIdSchema, 'thread-1')
    const turnId = v.parse(turnIdSchema, 'turn-1')
    const latestTurn: OrchestrationLatestTurn = {
      assistantMessageId: v.parse(messageIdSchema, 'message-2'),
      completedAt: timestamp(5),
      requestedAt: timestamp(1),
      startedAt: timestamp(2),
      state: 'completed',
      turnId,
    }
    const items = chatTimelineItems({
      activities: [activity('tool-done', threadId, timestamp(4), turnId)],
      latestTurn,
      messages: [
        message('message-1', threadId, timestamp(1), 'user'),
        message('message-2', threadId, timestamp(3), 'assistant', {
          streaming: true,
          text: 'Done',
          turnId,
          updatedAt: timestamp(4),
        }),
      ],
      optimisticMessages: [],
      proposedPlans: [],
    })
    const assistantItem = items.find(
      (item) => item.type === 'message' && item.message.role === 'assistant',
    )

    expect(assistantItem).toMatchObject({
      assistantStreaming: false,
      durationEnd: timestamp(5),
      showAssistantCopyButton: true,
      showCompletionDivider: true,
    })
  })

  it('projects assistant turn diff summaries onto assistant rows', () => {
    const threadId = v.parse(threadIdSchema, 'thread-1')
    const turnId = v.parse(turnIdSchema, 'turn-1')
    const assistantMessageId = v.parse(messageIdSchema, 'message-2')
    const items = chatTimelineItems({
      activities: [],
      latestTurn: null,
      messages: [
        message('message-1', threadId, timestamp(1), 'user'),
        message('message-2', threadId, timestamp(2), 'assistant', {
          text: 'Updated the files',
          turnId,
        }),
      ],
      optimisticMessages: [],
      proposedPlans: [],
      turnDiffSummaries: [
        turnDiffSummary(threadId, turnId, assistantMessageId, [
          checkpointFile('apps/web/src/App.tsx', 12, 4),
          checkpointFile('packages/contracts/src/index.ts', 2, 0),
        ]),
      ],
    })
    const assistantItem = items.find(
      (item) => item.type === 'message' && item.message.id === assistantMessageId,
    )

    expect(assistantItem).toMatchObject({
      turnDiffSummary: {
        files: [
          { additions: 12, deletions: 4, path: 'apps/web/src/App.tsx' },
          { additions: 2, deletions: 0, path: 'packages/contracts/src/index.ts' },
        ],
      },
    })
  })

  it('projects checkpoint revert counts onto the nearby user row', () => {
    const threadId = v.parse(threadIdSchema, 'thread-1')
    const turnId = v.parse(turnIdSchema, 'turn-1')
    const assistantMessageId = v.parse(messageIdSchema, 'message-2')
    const items = chatTimelineItems({
      activities: [],
      latestTurn: null,
      messages: [
        message('message-1', threadId, timestamp(1), 'user', { turnId }),
        message('message-2', threadId, timestamp(2), 'assistant', {
          text: 'Updated the files',
          turnId,
        }),
      ],
      optimisticMessages: [],
      proposedPlans: [],
      turnDiffSummaries: [
        {
          ...turnDiffSummary(threadId, turnId, assistantMessageId, [
            checkpointFile('apps/web/src/App.tsx', 12, 4),
          ]),
          checkpointTurnCount: 3,
        },
      ],
    })
    const userItem = items.find(
      (item) => item.type === 'message' && item.message.id === 'message-1',
    )

    expect(userItem).toMatchObject({
      revertTurnCount: 2,
    })
  })
})

function message(
  id: string,
  threadId: ReturnType<typeof parseThreadId>,
  createdAt: string,
  role: OrchestrationMessage['role'],
  options: {
    streaming?: boolean
    text?: string
    turnId?: ReturnType<typeof parseTurnId> | null
    updatedAt?: string
  } = {},
): OrchestrationMessage {
  return {
    attachments: [],
    createdAt,
    id: v.parse(messageIdSchema, id),
    role,
    streaming: options.streaming ?? false,
    text: options.text ?? id,
    threadId,
    turnId: options.turnId ?? null,
    updatedAt: options.updatedAt ?? createdAt,
  }
}

function optimisticMessage(
  id: string,
  threadId: ReturnType<typeof parseThreadId>,
  createdAt: string,
  turnId: ReturnType<typeof parseTurnId>,
): OptimisticChatMessage {
  return {
    ...message(id, threadId, createdAt, 'user'),
    commandId: v.parse(commandIdSchema, `command-${id}`),
    optimistic: true,
    turnId,
  }
}

function activity(
  id: string,
  threadId: ReturnType<typeof parseThreadId>,
  createdAt: string,
  turnId: ReturnType<typeof parseTurnId>,
  kind = 'tool.completed',
  tone: OrchestrationThreadActivity['tone'] = 'tool',
  payload: unknown = null,
): OrchestrationThreadActivity {
  return {
    createdAt,
    id: v.parse(eventIdSchema, id),
    kind,
    payload,
    summary: id,
    threadId,
    tone,
    turnId,
  }
}

function proposedPlan(
  id: string,
  threadId: ReturnType<typeof parseThreadId>,
  createdAt: string,
  turnId: ReturnType<typeof parseTurnId>,
  updatedAt = createdAt,
): OrchestrationProposedPlan {
  return {
    createdAt,
    id: v.parse(proposedPlanIdSchema, id),
    planMarkdown: '- Do the work',
    threadId,
    turnId,
    updatedAt,
  }
}

function turnDiffSummary(
  threadId: ReturnType<typeof parseThreadId>,
  turnId: ReturnType<typeof parseTurnId>,
  assistantMessageId: ReturnType<typeof parseMessageId> | null,
  files: ChatTurnDiffSummary['files'],
): ChatTurnDiffSummary {
  return {
    assistantMessageId,
    checkpointRef: `checkpoint-${turnId}`,
    checkpointTurnCount: 1,
    completedAt: timestamp(5),
    files,
    status: 'ready',
    threadId,
    turnId,
  }
}

function checkpointFile(
  path: string,
  additions: number,
  deletions: number,
): ChatTurnDiffSummary['files'][number] {
  return {
    additions,
    deletions,
    kind: 'modified',
    path,
  }
}

function parseMessageId(value: string) {
  return v.parse(messageIdSchema, value)
}

function parseThreadId(value: string) {
  return v.parse(threadIdSchema, value)
}

function parseTurnId(value: string) {
  return v.parse(turnIdSchema, value)
}

function timestamp(index: number) {
  return `2026-05-24T12:00:0${index}.000Z`
}
