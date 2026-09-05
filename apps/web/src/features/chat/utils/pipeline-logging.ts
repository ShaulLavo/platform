import type {
  ClientOrchestrationCommand,
  OrchestrationEvent,
  OrchestrationReplayEventsInput,
  OrchestrationShellStreamItem,
  OrchestrationSessionDetailSnapshot,
  OrchestrationSessionStreamItem,
  SessionId,
} from '@workspace/contracts'

import { log } from '@/lib/client-logging'
import { createWideEventScope, type WideEventScope } from '@/lib/wide-event-scope'

type ChatLogContext = Record<string, unknown>
export type ChatPipelineScope = WideEventScope

export function logChatPipelineInfo(action: string, context: ChatLogContext = {}) {
  log.info(chatLogEvent(action, context))
}

export function logChatPipelineWarn(action: string, context: ChatLogContext = {}) {
  log.warn(chatLogEvent(action, context))
}

export function createChatPipelineScope(action: string, context: ChatLogContext = {}) {
  return createWideEventScope(chatLogEvent(action, context))
}

export function chatCommandSummary(command: ClientOrchestrationCommand) {
  const summary: ChatLogContext = {
    commandId: command.commandId,
    commandType: command.type,
  }

  if ('sessionId' in command) summary.sessionId = command.sessionId
  if ('projectId' in command) summary.projectId = command.projectId
  if ('turnId' in command) summary.turnId = command.turnId

  if (command.type === 'session.turn.start') {
    summary.attachmentCount = command.message.attachments.length
    summary.bootstrapCreateSession = Boolean(command.bootstrap?.createSession)
    summary.interactionMode = command.interactionMode
    summary.messageId = command.message.messageId
    summary.model = command.modelSelection?.model
    summary.providerInstanceId = command.modelSelection?.providerInstanceId
    summary.worktreeId = command.bootstrap?.createSession?.worktreeId
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
    sessionId: sessionIdFromEvent(event),
  }
}

export function chatReplaySummary(input: OrchestrationReplayEventsInput) {
  return {
    afterSequence: input.afterSequence,
    aggregateId: input.aggregateId,
    aggregateKind: input.aggregateKind,
    sessionId: input.sessionId,
  }
}

export function chatSessionSnapshotSummary(snapshot: OrchestrationSessionDetailSnapshot) {
  return {
    activityCount: snapshot.session.activities.length,
    latestTurnState: snapshot.session.latestTurn?.state ?? null,
    messageCount: snapshot.session.messages.length,
    sessionStatus: snapshot.session.runtime?.status ?? null,
    snapshotSequence: snapshot.snapshotSequence,
    sessionId: snapshot.session.id,
  }
}

export function chatStreamItemSummary(
  item: OrchestrationShellStreamItem | OrchestrationSessionStreamItem,
) {
  if (item.kind === 'snapshot') return chatSnapshotStreamItemSummary(item)
  if ('event' in item) return { ...chatEventSummary(item.event), itemKind: item.kind }
  if ('session' in item) {
    return {
      itemKind: item.kind,
      sequence: item.sequence,
      sessionId: item.session.id,
    }
  }
  if ('sessionId' in item) {
    return {
      itemKind: item.kind,
      sequence: item.sequence,
      sessionId: item.sessionId,
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
    projectId: 'projectId' in item ? item.projectId : undefined,
    ...('worktree' in item ? { worktreeId: item.worktree.id } : {}),
    ...('worktreeId' in item ? { worktreeId: item.worktreeId } : {}),
    sequence: item.sequence,
  }
}

export function optimisticMessageSummary(input: {
  commandId?: string
  messageId: string
  textLength?: number
  sessionId: SessionId
}) {
  return {
    commandId: input.commandId,
    messageId: input.messageId,
    textLength: input.textLength,
    sessionId: input.sessionId,
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
  item: Extract<
    OrchestrationShellStreamItem | OrchestrationSessionStreamItem,
    { kind: 'snapshot' }
  >,
) {
  if ('session' in item.snapshot) {
    return {
      itemKind: item.kind,
      ...chatSessionSnapshotSummary(item.snapshot),
    }
  }

  return {
    itemKind: item.kind,
    projectCount: item.snapshot.projects.length,
    snapshotSequence: item.snapshot.snapshotSequence,
    sessionCount: item.snapshot.sessions.length,
  }
}

function sessionIdFromEvent(event: OrchestrationEvent) {
  if ('sessionId' in event.payload) return event.payload.sessionId

  return event.aggregateKind === 'session' ? event.aggregateId : undefined
}
