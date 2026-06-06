import { describe, expect, it } from 'vitest'
import {
  eventIdSchema,
  threadIdSchema,
  turnIdSchema,
  type OrchestrationThreadActivity,
} from '@workspace/contracts'
import * as v from 'valibot'

import { chatActivityPresentation } from '../chat-activity-presentation'

describe('chat activity presentation', () => {
  it('maps tool lifecycle payload status and detail', () => {
    const presentation = chatActivityPresentation(
      activity(
        'tool.completed',
        'tool',
        {
          detail: 'bun test failed',
          status: 'failed',
        },
        'Bash completed',
      ),
    )

    expect(presentation).toMatchObject({
      detail: 'bun test failed',
      icon: 'tool',
      status: 'Failed',
      title: 'Bash',
    })
  })

  it('maps pending approval and runtime errors to deliberate UI states', () => {
    expect(chatActivityPresentation(activity('approval.requested', 'approval')).status).toBe(
      'Pending',
    )
    expect(
      chatActivityPresentation(
        activity('runtime.error', 'error', {
          message: 'Provider crashed',
        }),
      ),
    ).toMatchObject({
      detail: 'Provider crashed',
      icon: 'error',
      title: 'Runtime error',
    })
  })

  it('maps task progress to thinking with payload summary as the row label', () => {
    expect(
      chatActivityPresentation(
        activity(
          'task.progress',
          'thinking',
          {
            detail: 'unused duplicate detail',
            summary: 'Searching for API endpoints',
          },
          'Thinking',
        ),
      ),
    ).toMatchObject({
      detail: 'unused duplicate detail',
      icon: 'thinking',
      status: null,
      title: 'Searching for API endpoints',
    })
  })

  it('does not repeat backend thinking summary as row detail', () => {
    expect(
      chatActivityPresentation(
        activity(
          'task.progress',
          'thinking',
          {
            detail: 'Searching for API endpoints',
            summary: 'Searching for API endpoints',
          },
          'Thinking',
        ),
      ),
    ).toMatchObject({
      detail: null,
      title: 'Searching for API endpoints',
    })
  })

  it('uses task completion detail as the compact row label', () => {
    expect(
      chatActivityPresentation(
        activity('task.completed', 'error', { detail: 'Failed to deploy changes' }, 'Task failed'),
      ),
    ).toMatchObject({
      detail: null,
      title: 'Failed to deploy changes',
    })
  })
})

function activity(
  kind: string,
  tone: OrchestrationThreadActivity['tone'],
  payload: unknown = null,
  summary = kind,
): OrchestrationThreadActivity {
  return {
    createdAt: '2026-05-28T00:00:00.000Z',
    id: v.parse(eventIdSchema, `event-${kind}`),
    kind,
    payload,
    summary,
    threadId: v.parse(threadIdSchema, 'thread-1'),
    tone,
    turnId: v.parse(turnIdSchema, 'turn-1'),
  }
}
