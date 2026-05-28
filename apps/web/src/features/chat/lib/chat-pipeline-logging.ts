import type {
  ClientOrchestrationCommand,
  OrchestrationEvent,
  OrchestrationReplayEventsInput,
  OrchestrationShellStreamItem,
  OrchestrationThreadDetailSnapshot,
  OrchestrationThreadStreamItem,
  ThreadId,
} from '@workspace/contracts'

import { log } from '@/lib/client-logging'

type ChatLogContext = Record<string, unknown>

export function logChatPipelineDebug(action: string, context: ChatLogContext = {}) {
  log.debug(chatLogEvent(action, context))
}

export function logChatPipelineInfo(action: string, context: ChatLogContext = {}) {
  log.info(chatLogEvent(action, context))
}

export function logChatPipelineWarn(action: string, context: ChatLogContext = {}) {
  log.warn(chatLogEvent(action, context))
}

export function logChatPipelineError(action: string, context: ChatLogContext = {}) {
  log.error(chatLogEvent(action, context))
}

export function chatCommandSummary(command: ClientOrchestrationCommand) {
  const summary: ChatLogContext = {
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

export function chatEventSummary(event: OrchestrationEvent): ChatLogContext {
  return {
    actorKind: event.actorKind,
    aggregateId: event.aggregateId,
    aggregateKind: event.aggregateKind,
    commandId: event.commandId,
    eventId: event.eventId,
    eventType: event.type,
    sequence: event.sequence,
    threadId: threadIdFromEvent(event),
  }
}

export function chatReplaySummary(input: OrchestrationReplayEventsInput) {
  return {
    afterSequence: input.afterSequence,
    aggregateId: input.aggregateId,
    aggregateKind: input.aggregateKind,
    threadId: input.threadId,
  }
}

export function chatThreadSnapshotSummary(snapshot: OrchestrationThreadDetailSnapshot) {
  return {
    activityCount: snapshot.thread.activities.length,
    latestTurnState: snapshot.thread.latestTurn?.state ?? null,
    messageCount: snapshot.thread.messages.length,
    sessionStatus: snapshot.thread.session?.status ?? null,
    snapshotSequence: snapshot.snapshotSequence,
    threadId: snapshot.thread.id,
  }
}

export function chatStreamItemSummary(
  item: OrchestrationShellStreamItem | OrchestrationThreadStreamItem,
) {
  if (item.kind === 'snapshot') return chatSnapshotStreamItemSummary(item)
  if ('event' in item) return { ...chatEventSummary(item.event), itemKind: item.kind }
  if ('thread' in item) {
    return {
      itemKind: item.kind,
      sequence: item.sequence,
      threadId: item.thread.id,
    }
  }
  if ('threadId' in item) {
    return {
      itemKind: item.kind,
      sequence: item.sequence,
      threadId: item.threadId,
    }
  }
  if ('project' in item) {
    return {
      itemKind: item.kind,
      projectId: item.project.id,
      sequence: item.sequence,
    }
  }

  return {
    itemKind: item.kind,
    projectId: item.projectId,
    sequence: item.sequence,
  }
}

export function optimisticMessageSummary(input: {
  commandId?: string
  messageId: string
  textLength?: number
  threadId: ThreadId
}) {
  return {
    commandId: input.commandId,
    messageId: input.messageId,
    textLength: input.textLength,
    threadId: input.threadId,
  }
}

function chatLogEvent(action: string, context: ChatLogContext) {
  return {
    action,
    area: 'chat',
    pipeline: 'chat',
    ...context,
  }
}

function chatSnapshotStreamItemSummary(
  item: Extract<OrchestrationShellStreamItem | OrchestrationThreadStreamItem, { kind: 'snapshot' }>,
) {
  if ('thread' in item.snapshot) {
    return {
      itemKind: item.kind,
      ...chatThreadSnapshotSummary(item.snapshot),
    }
  }

  return {
    itemKind: item.kind,
    projectCount: item.snapshot.projects.length,
    snapshotSequence: item.snapshot.snapshotSequence,
    threadCount: item.snapshot.threads.length,
  }
}

function threadIdFromEvent(event: OrchestrationEvent) {
  if ('threadId' in event.payload) return event.payload.threadId

  return event.aggregateKind === 'thread' ? event.aggregateId : undefined
}
