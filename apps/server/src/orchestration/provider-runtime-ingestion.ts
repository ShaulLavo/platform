import {
  commandIdSchema,
  DEFAULT_RUNTIME_MODE,
  eventIdSchema,
  messageIdSchema,
  proposedPlanIdSchema,
  type InternalOrchestrationCommand,
  type OrchestrationSession,
} from '@workspace/contracts'
import * as v from 'valibot'
import type { ProviderRuntimeEvent } from '../provider/types'

export type ProviderRuntimeDispatch = (command: InternalOrchestrationCommand) => Promise<unknown>

const SEEN_RUNTIME_EVENT_ID_MAX = 20_000

export class ProviderRuntimeIngestion {
  private readonly dispatch: ProviderRuntimeDispatch
  private readonly seenEventIdQueue: string[] = []
  private readonly seenEventIds = new Set<string>()

  constructor(dispatch: ProviderRuntimeDispatch) {
    this.dispatch = dispatch
  }

  async ingest(event: ProviderRuntimeEvent) {
    if (this.seenEventIds.has(event.eventId)) return

    this.rememberEventId(event.eventId)
    await this.dispatch(commandForRuntimeEvent(event))
  }

  private rememberEventId(eventId: string) {
    this.seenEventIds.add(eventId)
    this.seenEventIdQueue.push(eventId)
    if (this.seenEventIdQueue.length <= SEEN_RUNTIME_EVENT_ID_MAX) return

    const expired = this.seenEventIdQueue.shift()
    if (expired) this.seenEventIds.delete(expired)
  }
}

function commandForRuntimeEvent(event: ProviderRuntimeEvent): InternalOrchestrationCommand {
  switch (event.type) {
    case 'session.set':
      return {
        commandId: providerCommandId(event.eventId, 'session-set'),
        createdAt: event.createdAt,
        session: sessionFromRuntimeEvent(event),
        threadId: event.threadId,
        type: 'thread.session.set',
      }
    case 'assistant.delta':
      return {
        commandId: providerCommandId(event.eventId, 'assistant-delta'),
        createdAt: event.createdAt,
        delta: event.delta,
        messageId: v.parse(messageIdSchema, event.messageId),
        threadId: event.threadId,
        turnId: event.turnId,
        type: 'thread.message.assistant.delta',
      }
    case 'assistant.complete':
      return {
        commandId: providerCommandId(event.eventId, 'assistant-complete'),
        completedAt: event.completedAt,
        messageId: v.parse(messageIdSchema, event.messageId),
        threadId: event.threadId,
        turnId: event.turnId,
        type: 'thread.message.assistant.complete',
      }
    case 'activity.append':
      return {
        activity: {
          createdAt: event.createdAt,
          id: v.parse(eventIdSchema, event.eventId),
          kind: event.kind,
          payload: event.payload ?? { detail: event.detail ?? null },
          summary: event.summary,
          threadId: event.threadId,
          tone: event.tone,
          turnId: event.turnId,
        },
        commandId: providerCommandId(event.eventId, 'activity-append'),
        createdAt: event.createdAt,
        threadId: event.threadId,
        type: 'thread.activity.append',
      }
    case 'proposed-plan.upsert':
      return {
        commandId: providerCommandId(event.eventId, 'proposed-plan-upsert'),
        createdAt: event.createdAt,
        proposedPlan: {
          createdAt: event.createdAt,
          id: v.parse(
            proposedPlanIdSchema,
            event.planId ?? `plan:${event.threadId}:${event.turnId ?? event.eventId}`,
          ),
          planMarkdown: event.planMarkdown,
          threadId: event.threadId,
          turnId: event.turnId,
          updatedAt: event.updatedAt ?? event.createdAt,
        },
        threadId: event.threadId,
        type: 'thread.proposed-plan.upsert',
      }
  }
}

function sessionFromRuntimeEvent(
  event: Extract<ProviderRuntimeEvent, { type: 'session.set' }>,
): OrchestrationSession {
  return {
    activeTurnId: event.turnId,
    lastError: event.lastError ?? null,
    providerInstanceId: event.providerInstanceId,
    providerName: event.providerName ?? event.providerInstanceId,
    providerSessionId: event.providerSessionId,
    runtimeMode: event.runtimeMode ?? DEFAULT_RUNTIME_MODE,
    status: event.status,
    threadId: event.threadId,
    updatedAt: event.createdAt,
  }
}

function providerCommandId(eventId: string, tag: string) {
  return v.parse(commandIdSchema, `provider:${eventId}:${tag}`)
}
