import * as v from 'valibot'
import { sessionIdSchema } from '@workspace/contracts'
import type { PendingOrchestrationEvent } from '../../event-store'
import { pendingEvent, WORKTREE_ID } from './projection'

/**
 * The projection fixture pins every session event to its single session. Search
 * only means anything across sessions, so these builders re-aggregate the same
 * real events onto the session whose payload they carry.
 */
function forSession(
  sessionId: string,
  event: PendingOrchestrationEvent,
): PendingOrchestrationEvent {
  return { ...event, aggregateId: v.parse(sessionIdSchema, sessionId) }
}

export function searchSessionCreatedEvent(input: {
  createdAt?: string
  sessionId: string
  title?: string
}) {
  const createdAt = input.createdAt ?? '2026-06-01T00:00:00.000Z'

  return forSession(
    input.sessionId,
    pendingEvent(
      'session.created',
      {
        createdAt,
        interactionMode: 'default',
        modelSelection: { model: 'gpt-5-codex', providerInstanceId: 'codex' },
        worktreeId: WORKTREE_ID,
        origin: 'platform',
        runtimeMode: 'full-access',
        sessionId: input.sessionId,
        title: input.title ?? input.sessionId,
        updatedAt: createdAt,
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
  sessionId: string
}) {
  return forSession(
    input.sessionId,
    pendingEvent(
      'session.message-sent',
      {
        attachments: [],
        createdAt: input.createdAt,
        messageId: input.messageId,
        role: input.role ?? 'assistant',
        streaming: false,
        text: input.text,
        sessionId: input.sessionId,
        turnId: null,
        updatedAt: input.createdAt,
      },
      input.createdAt,
    ),
  )
}
