import type { ThreadId } from '@workspace/contracts'
import {
  recordProcessError,
  recordProcessInfo,
  recordProcessWarning,
  type OperationContext,
} from '../observability'
import type {
  OrchestrationCommand,
  OrchestrationEvent,
  OrchestrationReplayEventsInput,
} from './schemas'
import type {
  ProviderRuntimeEvent,
  ProviderTurnControlInput,
  ProviderTurnInput,
} from '../provider/types'
import type { ProviderRuntimeBindingWithMetadata } from '../provider/provider-session-directory'

type ChatPipelineContext = Record<string, unknown>

export function recordChatPipelineInfo(action: string, context: ChatPipelineContext = {}) {
  recordProcessInfo(action, chatPipelineContext(context))
}

export function recordChatPipelineWarning(action: string, context: ChatPipelineContext = {}) {
  recordProcessWarning(action, chatPipelineContext(context))
}

export function recordChatPipelineError(action: string, context: ChatPipelineContext = {}) {
  recordProcessError(action, chatPipelineContext(context))
}

export function chatOperationContext(
  operation: string,
  context: ChatPipelineContext = {},
): OperationContext {
  return {
    area: 'chat',
    operation,
    pipeline: 'chat',
    ...context,
  }
}

export function orchestrationCommandSummary(command: OrchestrationCommand) {
  const summary: ChatPipelineContext = {
    commandId: command.commandId,
    commandType: command.type,
  }

  if ('threadId' in command) summary.threadId = command.threadId
  if ('projectId' in command) summary.projectId = command.projectId
  if ('turnId' in command) summary.turnId = command.turnId

  if (command.type === 'thread.turn.start') {
    summary.attachmentCount = command.message.attachments.length
    summary.bootstrapCreateThread = Boolean(command.bootstrap?.createThread)
    summary.interactionMode = command.interactionMode
    summary.messageId = command.message.messageId
    summary.model = command.modelSelection?.model
    summary.providerInstanceId = command.modelSelection?.providerInstanceId
    summary.projectId = command.bootstrap?.createThread?.projectId
    summary.runtimeMode = command.runtimeMode
    summary.textLength = command.message.text.length
  }

  return summary
}

export function orchestrationEventSummary(event: OrchestrationEvent) {
  return {
    actorKind: event.actorKind,
    aggregateId: event.aggregateId,
    aggregateKind: event.aggregateKind,
    commandId: event.commandId,
    eventId: event.eventId,
    eventType: event.type,
    sequence: event.sequence,
    threadId: threadIdFromEvent(event),
    ...eventPayloadSummary(event),
  }
}

export function orchestrationEventBatchSummary(events: readonly OrchestrationEvent[]) {
  return {
    eventCount: events.length,
    eventTypes: events.map((event) => event.type),
    maxSequence: events.at(-1)?.sequence ?? null,
    sequences: events.map((event) => event.sequence),
    threadIds: uniqueValues(threadIdsFromEvents(events)),
  }
}

export function orchestrationReplaySummary(input: OrchestrationReplayEventsInput) {
  return {
    afterSequence: input.afterSequence,
    aggregateId: input.aggregateId,
    aggregateKind: input.aggregateKind,
    threadId: input.threadId,
  }
}

export function providerRuntimeEventSummary(event: ProviderRuntimeEvent) {
  const summary: ChatPipelineContext = {
    eventId: event.eventId,
    eventType: event.type,
    threadId: event.threadId,
  }

  if ('turnId' in event) summary.turnId = event.turnId
  if ('providerInstanceId' in event) summary.providerInstanceId = event.providerInstanceId

  if (event.type === 'session.set') {
    summary.activeTurnId = event.turnId
    summary.providerSessionId = event.providerSessionId
    summary.runtimeMode = event.runtimeMode
    summary.sessionStatus = event.status
  }
  if (event.type === 'assistant.delta') {
    summary.deltaLength = event.delta.length
    summary.messageId = event.messageId
  }
  if (event.type === 'assistant.complete') {
    summary.messageId = event.messageId
  }
  if (event.type === 'activity.append') {
    summary.activityKind = event.kind
    summary.tone = event.tone
  }
  if (event.type === 'proposed-plan.upsert') {
    summary.planId = event.planId
    summary.planLength = event.planMarkdown.length
  }

  return summary
}

export function providerTurnSummary(input: ProviderTurnInput) {
  return {
    attachmentCount: input.attachments.length,
    interactionMode: input.interactionMode,
    model: input.modelSelection.model,
    providerInstanceId: input.providerInstanceId,
    runtimeMode: input.runtimeMode,
    textLength: input.messageText.length,
    threadId: input.thread.id,
    turnId: input.turnId,
  }
}

export function providerTurnControlSummary(input: ProviderTurnControlInput) {
  return {
    threadId: input.threadId,
    turnId: input.turnId,
  }
}

export function providerBindingSummary(binding: ProviderRuntimeBindingWithMetadata | null) {
  if (!binding) return { binding: null }

  return {
    adapterKey: binding.adapterKey,
    providerDriverKind: binding.providerDriverKind,
    providerInstanceId: binding.providerInstanceId,
    providerSessionId: binding.providerSessionId,
    runtimeMode: binding.runtimeMode,
    status: binding.status,
    threadId: binding.threadId,
  }
}

function chatPipelineContext(context: ChatPipelineContext) {
  return {
    area: 'chat',
    pipeline: 'chat',
    ...context,
  }
}

function eventPayloadSummary(event: OrchestrationEvent): ChatPipelineContext {
  if (event.type === 'thread.message-sent') {
    return {
      messageId: event.payload.messageId,
      messageRole: event.payload.role,
      streaming: event.payload.streaming,
      textLength: event.payload.text.length,
      turnId: event.payload.turnId,
    }
  }
  if (event.type === 'thread.turn-start-requested') {
    return {
      messageId: event.payload.messageId,
      turnId: event.payload.turnId,
    }
  }
  if (event.type === 'thread.session-set') {
    return {
      activeTurnId: event.payload.session.activeTurnId,
      providerInstanceId: event.payload.session.providerInstanceId,
      providerSessionId: event.payload.session.providerSessionId,
      sessionStatus: event.payload.session.status,
    }
  }
  if (event.type === 'thread.activity-appended') {
    return {
      activityId: event.payload.activity.id,
      activityKind: event.payload.activity.kind,
      tone: event.payload.activity.tone,
      turnId: event.payload.activity.turnId,
    }
  }

  return {}
}

function threadIdFromEvent(event: OrchestrationEvent): ThreadId | undefined {
  if ('threadId' in event.payload) return event.payload.threadId
  if (event.aggregateKind === 'thread') return event.aggregateId as ThreadId

  return undefined
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values))
}

function threadIdsFromEvents(events: readonly OrchestrationEvent[]) {
  const threadIds: string[] = []

  for (const event of events) {
    const threadId = threadIdFromEvent(event)
    if (!threadId) continue

    threadIds.push(threadId)
  }

  return threadIds
}
