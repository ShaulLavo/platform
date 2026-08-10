import * as v from 'valibot'
import { threadIdSchema } from '@workspace/contracts'
import type { PendingOrchestrationEvent } from '../../event-store'
import { pendingEvent, PROJECT_ID } from './projection'

/**
 * The projection fixture pins every thread event to its single thread. Search
 * only means anything across threads, so these builders re-aggregate the same
 * real events onto the thread whose payload they carry.
 */
function forThread(threadId: string, event: PendingOrchestrationEvent): PendingOrchestrationEvent {
  return { ...event, aggregateId: v.parse(threadIdSchema, threadId) }
}

export function searchThreadCreatedEvent(input: {
  createdAt?: string
  threadId: string
  title?: string
}) {
  const createdAt = input.createdAt ?? '2026-06-01T00:00:00.000Z'

  return forThread(
    input.threadId,
    pendingEvent(
      'thread.created',
      {
        branch: null,
        createdAt,
        interactionMode: 'default',
        modelSelection: { model: 'gpt-5-codex', providerInstanceId: 'codex' },
        projectId: PROJECT_ID,
        runtimeMode: 'full-access',
        threadId: input.threadId,
        title: input.title ?? input.threadId,
        updatedAt: createdAt,
        worktreePath: null,
      },
      createdAt,
    ),
  )
}

export function searchMessageEvent(input: {
  createdAt: string
  messageId: string
  role?: 'assistant' | 'user'
  text: string
  threadId: string
}) {
  return forThread(
    input.threadId,
    pendingEvent(
      'thread.message-sent',
      {
        attachments: [],
        createdAt: input.createdAt,
        messageId: input.messageId,
        role: input.role ?? 'assistant',
        streaming: false,
        text: input.text,
        threadId: input.threadId,
        turnId: null,
        updatedAt: input.createdAt,
      },
      input.createdAt,
    ),
  )
}
