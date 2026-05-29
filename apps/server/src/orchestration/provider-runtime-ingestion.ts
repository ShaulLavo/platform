import {
  commandIdSchema,
  DEFAULT_RUNTIME_MODE,
  eventIdSchema,
  messageIdSchema,
  proposedPlanIdSchema,
  type InternalOrchestrationCommand,
  type MessageId,
  type OrchestrationSession,
  type OrchestrationThreadActivity,
  type ThreadId,
  type TurnId,
} from '@workspace/contracts'
import * as v from 'valibot'
import type { ProviderRuntimeEvent } from '../provider/types'
import {
  BoundedTtlCache,
  PROVIDER_RUNTIME_BUFFER_TTL_MS,
  ProviderRuntimeBuffers,
} from './provider-runtime-buffers'

export type ProviderRuntimeDispatch = (command: InternalOrchestrationCommand) => Promise<unknown>
export type AssistantDeliveryMode = 'streaming' | 'buffered'

const SEEN_RUNTIME_EVENT_ID_MAX = 20_000
const TOOL_LIFECYCLE_ITEM_TYPES = new Set([
  'command_execution',
  'file_change',
  'mcp_tool_call',
  'dynamic_tool_call',
  'collab_agent_tool_call',
  'web_search',
  'image_view',
])

export class ProviderRuntimeIngestion {
  private readonly assistantDeliveryMode: AssistantDeliveryMode
  private readonly buffers: ProviderRuntimeBuffers
  private readonly dispatch: ProviderRuntimeDispatch
  private queue = Promise.resolve()
  private readonly seenEventIds: BoundedTtlCache<string, true>

  constructor(
    dispatch: ProviderRuntimeDispatch,
    options: {
      assistantDeliveryMode?: AssistantDeliveryMode
      buffers?: ProviderRuntimeBuffers
      now?: () => number
    } = {},
  ) {
    this.assistantDeliveryMode = options.assistantDeliveryMode ?? 'streaming'
    this.buffers = options.buffers ?? new ProviderRuntimeBuffers({ now: options.now })
    this.dispatch = dispatch
    this.seenEventIds = new BoundedTtlCache({
      capacity: SEEN_RUNTIME_EVENT_ID_MAX,
      now: options.now,
      ttlMs: PROVIDER_RUNTIME_BUFFER_TTL_MS,
    })
  }

  ingest(event: ProviderRuntimeEvent) {
    const task = this.queue.then(() => this.processEvent(event))
    this.queue = task.then(noop, noop)
    return task
  }

  drain() {
    return this.queue
  }

  private async processEvent(event: ProviderRuntimeEvent) {
    if (this.seenEventIds.has(event.eventId)) return

    this.seenEventIds.set(event.eventId, true)
    await this.dispatchSessionCommand(event)
    await this.dispatchContentCommands(event)
    await this.dispatchActivityCommands(event)
  }

  private async dispatchSessionCommand(event: ProviderRuntimeEvent) {
    if (event.type === 'session.set') {
      await this.dispatch(sessionSetCommand(event))
      return
    }

    const session = sessionFromLifecycleEvent(event)
    if (!session) return

    await this.dispatch({
      commandId: providerCommandId(event.eventId, 'session-set'),
      createdAt: session.updatedAt,
      session,
      threadId: event.threadId,
      type: 'thread.session.set',
    })
  }

  private async dispatchContentCommands(event: ProviderRuntimeEvent) {
    switch (event.type) {
      case 'assistant.delta':
        await this.bufferAssistantDelta({
          createdAt: event.createdAt,
          delta: event.delta,
          event,
          messageId: v.parse(messageIdSchema, event.messageId),
          threadId: event.threadId,
          turnId: event.turnId,
        })
        return
      case 'assistant.complete':
        await this.completeAssistantMessage({
          completedAt: event.completedAt,
          event,
          messageId: v.parse(messageIdSchema, event.messageId),
          threadId: event.threadId,
          turnId: event.turnId,
        })
        return
      case 'content.delta':
        await this.handleContentDelta(event)
        return
      case 'item.completed':
        await this.handleItemCompleted(event)
        return
      case 'request.opened':
      case 'user-input.requested':
        await this.pauseAssistantSegment(event)
        return
      case 'proposed-plan.upsert':
        await this.upsertProposedPlan({
          createdAt: event.createdAt,
          event,
          planId: event.planId ?? proposedPlanIdFromEvent(event),
          planMarkdown: event.planMarkdown,
          threadId: event.threadId,
          turnId: event.turnId,
          updatedAt: event.updatedAt ?? event.createdAt,
        })
        return
      case 'turn.proposed.delta':
        this.buffers.appendBufferedProposedPlan(
          proposedPlanIdFromEvent(event),
          event.payload.delta,
          event.createdAt,
        )
        return
      case 'turn.proposed.completed':
        await this.finalizeBufferedProposedPlan({
          event,
          fallbackMarkdown: event.payload.planMarkdown,
          planId: proposedPlanIdFromEvent(event),
          threadId: event.threadId,
          turnId: event.turnId,
          updatedAt: event.createdAt,
        })
        return
      case 'turn.completed':
        await this.completeTurn(event)
        return
      case 'session.exited':
        this.buffers.clearTurnStateForSession(event.threadId)
        return
    }
  }

  private async bufferAssistantDelta(input: {
    createdAt: string
    delta: string
    event: ProviderRuntimeEvent
    messageId: MessageId
    threadId: ThreadId
    turnId: TurnId | undefined
  }) {
    if (input.delta.length === 0) return
    if (input.turnId)
      this.buffers.rememberAssistantMessageId(input.threadId, input.turnId, input.messageId)

    if (this.assistantDeliveryMode === 'streaming') {
      await this.dispatch(assistantDeltaCommand(input, input.delta, 'assistant-delta'))
      return
    }

    const spill = this.buffers.appendBufferedAssistantText(input.messageId, input.delta)
    if (spill.length === 0) return

    await this.dispatch(assistantDeltaCommand(input, spill, 'assistant-delta-buffer-spill'))
  }

  private async handleContentDelta(
    event: Extract<ProviderRuntimeEvent, { type: 'content.delta' }>,
  ) {
    if (event.payload.streamKind === 'plan_text') {
      this.buffers.appendBufferedProposedPlan(
        proposedPlanIdFromEvent(event),
        event.payload.delta,
        event.createdAt,
      )
      return
    }
    if (event.payload.streamKind !== 'assistant_text') return

    const messageId = this.buffers.getOrCreateAssistantMessageId({
      baseKey: assistantSegmentBaseKey(event),
      threadId: event.threadId,
      turnId: event.turnId,
    })
    await this.bufferAssistantDelta({
      createdAt: event.createdAt,
      delta: event.payload.delta,
      event,
      messageId,
      threadId: event.threadId,
      turnId: event.turnId,
    })
  }

  private async completeAssistantMessage(input: {
    completedAt: string
    event: ProviderRuntimeEvent
    fallbackText?: string
    messageId: MessageId
    threadId: ThreadId
    turnId: TurnId | undefined
  }) {
    const hasProjectedMessage = input.turnId
      ? this.buffers.assistantMessageIdsForTurn(input.threadId, input.turnId).has(input.messageId)
      : true
    await this.finalizeAssistantMessage({
      commandTag: `assistant-complete:${input.messageId}`,
      completedAt: input.completedAt,
      event: input.event,
      fallbackText: hasProjectedMessage ? undefined : input.fallbackText,
      finalDeltaCommandTag: `assistant-delta-finalize:${input.messageId}`,
      hasProjectedMessage,
      messageId: input.messageId,
      threadId: input.threadId,
      turnId: input.turnId,
    })
    if (input.turnId)
      this.buffers.forgetAssistantMessageId(input.threadId, input.turnId, input.messageId)
  }

  private async finalizeAssistantMessage(input: {
    commandTag: string
    completedAt: string
    event: ProviderRuntimeEvent
    fallbackText?: string
    finalDeltaCommandTag: string
    hasProjectedMessage: boolean
    messageId: MessageId
    threadId: ThreadId
    turnId: TurnId | undefined
  }) {
    const bufferedText = this.buffers.takeBufferedAssistantText(input.messageId)
    const text = finalizedAssistantText(bufferedText, input.fallbackText)
    const hasText = hasRenderableText(text)
    if (hasText) await this.dispatch(assistantDeltaCommand(input, text, input.finalDeltaCommandTag))
    if (!input.hasProjectedMessage && !hasText) return

    await this.dispatch({
      commandId: providerCommandId(input.event.eventId, input.commandTag),
      completedAt: input.completedAt,
      messageId: input.messageId,
      threadId: input.threadId,
      turnId: input.turnId,
      type: 'thread.message.assistant.complete',
    })
    this.buffers.clearBufferedAssistantText(input.messageId)
  }

  private async handleItemCompleted(
    event: Extract<ProviderRuntimeEvent, { type: 'item.completed' }>,
  ) {
    if (event.payload.itemType !== 'assistant_message') return

    const turnId = event.turnId
    const fallbackMessageId = v.parse(
      messageIdSchema,
      `assistant:${event.itemId ?? event.turnId ?? event.eventId}`,
    )
    const messageId = turnId
      ? (this.buffers.activeAssistantMessageIdForTurn(event.threadId, turnId) ?? fallbackMessageId)
      : fallbackMessageId
    await this.completeAssistantMessage({
      completedAt: event.createdAt,
      event,
      fallbackText: event.payload.detail,
      messageId,
      threadId: event.threadId,
      turnId,
    })
    if (!turnId) return

    this.buffers.clearAssistantSegmentStateForTurn(event.threadId, turnId)
  }

  private async pauseAssistantSegment(
    event: Extract<ProviderRuntimeEvent, { type: 'request.opened' | 'user-input.requested' }>,
  ) {
    if (!event.turnId) return

    const messageId = this.buffers.activeAssistantMessageIdForTurn(event.threadId, event.turnId)
    if (!messageId) return

    await this.completeAssistantMessage({
      completedAt: event.createdAt,
      event,
      messageId,
      threadId: event.threadId,
      turnId: event.turnId,
    })
    this.buffers.markActiveAssistantSegmentComplete(event.threadId, event.turnId)
  }

  private async completeTurn(event: Extract<ProviderRuntimeEvent, { type: 'turn.completed' }>) {
    if (!event.turnId) return

    const messageIds = this.buffers.assistantMessageIdsForTurn(event.threadId, event.turnId)
    for (const messageId of messageIds) {
      await this.completeAssistantMessage({
        completedAt: event.createdAt,
        event,
        messageId,
        threadId: event.threadId,
        turnId: event.turnId,
      })
    }
    this.buffers.clearAssistantMessageIdsForTurn(event.threadId, event.turnId)
    this.buffers.clearAssistantSegmentStateForTurn(event.threadId, event.turnId)
    await this.finalizeBufferedProposedPlan({
      event,
      planId: proposedPlanIdForTurn(event.threadId, event.turnId),
      threadId: event.threadId,
      turnId: event.turnId,
      updatedAt: event.createdAt,
    })
  }

  private async finalizeBufferedProposedPlan(input: {
    event: ProviderRuntimeEvent
    fallbackMarkdown?: string
    planId: string
    threadId: ThreadId
    turnId: TurnId | null | undefined
    updatedAt: string
  }) {
    const buffer = this.buffers.takeBufferedProposedPlan(input.planId)
    await this.upsertProposedPlan({
      createdAt: buffer?.createdAt ?? input.updatedAt,
      event: input.event,
      planId: input.planId,
      planMarkdown: normalizeProposedPlanMarkdown(buffer?.text) ?? input.fallbackMarkdown,
      threadId: input.threadId,
      turnId: input.turnId ?? null,
      updatedAt: input.updatedAt,
    })
  }

  private async upsertProposedPlan(input: {
    createdAt: string
    event: ProviderRuntimeEvent
    planId: string
    planMarkdown: string | undefined
    threadId: ThreadId
    turnId: TurnId | null | undefined
    updatedAt: string
  }) {
    const planMarkdown = normalizeProposedPlanMarkdown(input.planMarkdown)
    if (!planMarkdown) return

    await this.dispatch({
      commandId: providerCommandId(input.event.eventId, `proposed-plan-upsert:${input.planId}`),
      createdAt: input.updatedAt,
      proposedPlan: {
        createdAt: input.createdAt,
        id: v.parse(proposedPlanIdSchema, input.planId),
        planMarkdown,
        threadId: input.threadId,
        turnId: input.turnId ?? null,
        updatedAt: input.updatedAt,
      },
      threadId: input.threadId,
      type: 'thread.proposed-plan.upsert',
    })
  }

  private async dispatchActivityCommands(event: ProviderRuntimeEvent) {
    for (const activity of activitiesForRuntimeEvent(event)) {
      await this.dispatch({
        activity,
        commandId: providerCommandId(event.eventId, `activity-append:${activity.kind}`),
        createdAt: activity.createdAt,
        threadId: activity.threadId,
        type: 'thread.activity.append',
      })
    }
  }
}

function sessionSetCommand(
  event: Extract<ProviderRuntimeEvent, { type: 'session.set' }>,
): InternalOrchestrationCommand {
  return {
    commandId: providerCommandId(event.eventId, 'session-set'),
    createdAt: event.createdAt,
    session: sessionFromRuntimeEvent(event),
    threadId: event.threadId,
    type: 'thread.session.set',
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

function sessionFromLifecycleEvent(event: ProviderRuntimeEvent): OrchestrationSession | null {
  if (!isLifecycleSessionEvent(event)) return null
  if (!event.providerInstanceId) return null

  return {
    activeTurnId: lifecycleActiveTurnId(event),
    lastError: lifecycleLastError(event),
    providerInstanceId: event.providerInstanceId,
    providerName: event.providerName ?? event.providerInstanceId,
    providerSessionId: event.providerSessionId ?? null,
    runtimeMode: event.runtimeMode ?? DEFAULT_RUNTIME_MODE,
    status: lifecycleSessionStatus(event),
    threadId: event.threadId,
    updatedAt: event.createdAt,
  }
}

function lifecycleActiveTurnId(
  event: Extract<ProviderRuntimeEvent, { type: LifecycleSessionType }>,
) {
  if (event.type === 'turn.started') return event.turnId ?? null
  if (event.type === 'turn.completed' || event.type === 'session.exited') return null

  return event.turnId ?? null
}

function lifecycleLastError(event: Extract<ProviderRuntimeEvent, { type: LifecycleSessionType }>) {
  if (event.type === 'runtime.error') return event.payload.message
  if (event.type === 'session.state.changed' && event.payload.state === 'error')
    return event.payload.reason ?? 'Provider session error'
  if (event.type === 'turn.completed' && event.payload.state === 'failed')
    return event.payload.errorMessage ?? 'Turn failed'

  return null
}

function lifecycleSessionStatus(
  event: Extract<ProviderRuntimeEvent, { type: LifecycleSessionType }>,
) {
  switch (event.type) {
    case 'session.started':
    case 'thread.started':
      return 'ready'
    case 'turn.started':
      return 'running'
    case 'turn.completed':
      return event.payload.state === 'failed' ? 'error' : 'ready'
    case 'runtime.error':
      return 'error'
    case 'session.exited':
      return 'stopped'
    case 'session.state.changed':
      return sessionStatusFromRuntimeState(event.payload.state)
  }
}

type LifecycleSessionType =
  | 'runtime.error'
  | 'session.exited'
  | 'session.started'
  | 'session.state.changed'
  | 'thread.started'
  | 'turn.completed'
  | 'turn.started'

function isLifecycleSessionEvent(
  event: ProviderRuntimeEvent,
): event is Extract<ProviderRuntimeEvent, { type: LifecycleSessionType }> {
  switch (event.type) {
    case 'runtime.error':
    case 'session.exited':
    case 'session.started':
    case 'session.state.changed':
    case 'thread.started':
    case 'turn.completed':
    case 'turn.started':
      return true
    default:
      return false
  }
}

function sessionStatusFromRuntimeState(
  state: 'error' | 'ready' | 'running' | 'starting' | 'stopped' | 'waiting',
) {
  if (state === 'waiting') return 'running'

  return state
}

function assistantDeltaCommand(
  input: {
    createdAt?: string
    completedAt?: string
    event: ProviderRuntimeEvent
    messageId: MessageId
    threadId: ThreadId
    turnId: TurnId | undefined
  },
  delta: string,
  tag: string,
): InternalOrchestrationCommand {
  return {
    commandId: providerCommandId(input.event.eventId, tag),
    createdAt: input.createdAt ?? input.completedAt ?? new Date().toISOString(),
    delta,
    messageId: input.messageId,
    threadId: input.threadId,
    turnId: input.turnId,
    type: 'thread.message.assistant.delta',
  }
}

function activitiesForRuntimeEvent(event: ProviderRuntimeEvent): OrchestrationThreadActivity[] {
  switch (event.type) {
    case 'activity.append':
      return [activityFromLegacyEvent(event)]
    case 'content.delta':
      return reasoningContentDeltaActivity(event)
    case 'item.started':
      return toolActivity(event, 'tool.started', `${event.payload.title ?? 'Tool'} started`)
    case 'item.updated':
      return toolActivity(event, 'tool.updated', event.payload.title ?? 'Tool updated')
    case 'item.completed':
      return toolActivity(event, 'tool.completed', event.payload.title ?? 'Tool')
    case 'request.opened':
      return requestOpenedActivity(event)
    case 'request.resolved':
      return requestResolvedActivity(event)
    case 'user-input.requested':
      return [
        baseActivity(event, 'info', 'user-input.requested', 'User input requested', {
          questions: event.payload.questions,
          requestId: event.requestId,
        }),
      ]
    case 'user-input.resolved':
      return [
        baseActivity(event, 'info', 'user-input.resolved', 'User input submitted', {
          answers: event.payload.answers,
          requestId: event.requestId,
        }),
      ]
    case 'task.started':
      return [taskStartedActivity(event)]
    case 'task.progress':
      return [taskProgressActivity(event)]
    case 'task.completed':
      return [taskCompletedActivity(event)]
    case 'runtime.warning':
      return [runtimeWarningActivity(event)]
    case 'runtime.error':
      return [runtimeErrorActivity(event)]
    case 'thread.state.changed':
      return contextCompactionActivity(event)
    case 'thread.token-usage.updated':
      return tokenUsageActivity(event)
    default:
      return []
  }
}

function activityFromLegacyEvent(
  event: Extract<ProviderRuntimeEvent, { type: 'activity.append' }>,
): OrchestrationThreadActivity {
  return {
    createdAt: event.createdAt,
    id: v.parse(eventIdSchema, event.eventId),
    kind: event.kind,
    payload: event.payload ?? { detail: event.detail ?? null },
    summary: event.summary,
    threadId: event.threadId,
    tone: event.tone,
    turnId: event.turnId,
  }
}

function toolActivity(
  event: Extract<
    ProviderRuntimeEvent,
    { type: 'item.started' | 'item.updated' | 'item.completed' }
  >,
  kind: string,
  summary: string,
) {
  if (!TOOL_LIFECYCLE_ITEM_TYPES.has(event.payload.itemType)) return []

  return [
    baseActivity(event, 'tool', kind, summary, {
      data: event.payload.data,
      detail: truncateDetail(event.payload.detail),
      itemType: event.payload.itemType,
      status: event.payload.status,
    }),
  ]
}

function requestOpenedActivity(event: Extract<ProviderRuntimeEvent, { type: 'request.opened' }>) {
  if (event.payload.requestType === 'tool_user_input') return []

  const requestKind = requestKindFromRequestType(event.payload.requestType)
  return [
    baseActivity(event, 'approval', 'approval.requested', approvalRequestSummary(requestKind), {
      detail: truncateDetail(event.payload.detail),
      requestId: event.requestId,
      requestKind,
      requestType: event.payload.requestType,
    }),
  ]
}

function requestResolvedActivity(
  event: Extract<ProviderRuntimeEvent, { type: 'request.resolved' }>,
) {
  if (event.payload.requestType === 'tool_user_input') return []

  return [
    baseActivity(event, 'approval', 'approval.resolved', 'Approval resolved', {
      decision: event.payload.decision,
      requestId: event.requestId,
      requestKind: requestKindFromRequestType(event.payload.requestType),
      requestType: event.payload.requestType,
    }),
  ]
}

function taskStartedActivity(event: Extract<ProviderRuntimeEvent, { type: 'task.started' }>) {
  const taskType = event.payload.taskType
  const summary = taskType === 'plan' ? 'Plan task started' : `${taskType ?? 'Task'} started`
  return baseActivity(event, 'info', 'task.started', summary, {
    detail: truncateDetail(event.payload.description),
    taskId: event.payload.taskId,
    taskType,
  })
}

function taskProgressActivity(event: Extract<ProviderRuntimeEvent, { type: 'task.progress' }>) {
  return baseActivity(event, 'thinking', 'task.progress', 'Thinking', {
    detail: truncateDetail(event.payload.summary ?? event.payload.description),
    lastToolName: event.payload.lastToolName,
    summary: truncateDetail(event.payload.summary),
    taskId: event.payload.taskId,
    usage: event.payload.usage,
  })
}

function reasoningContentDeltaActivity(
  event: Extract<ProviderRuntimeEvent, { type: 'content.delta' }>,
) {
  if (!isReasoningStreamKind(event.payload.streamKind)) return []

  const summary = truncateDetail(event.payload.delta)
  if (!summary) return []

  return [
    baseActivity(event, 'thinking', 'task.progress', 'Thinking', {
      contentIndex: event.payload.contentIndex,
      detail: summary,
      streamKind: event.payload.streamKind,
      summary,
      summaryIndex: event.payload.summaryIndex,
      taskId: event.itemId ?? event.eventId,
    }),
  ]
}

function taskCompletedActivity(event: Extract<ProviderRuntimeEvent, { type: 'task.completed' }>) {
  return baseActivity(
    event,
    event.payload.status === 'failed' ? 'error' : 'info',
    'task.completed',
    taskCompletedSummary(event),
    {
      detail: truncateDetail(event.payload.summary),
      status: event.payload.status,
      taskId: event.payload.taskId,
      usage: event.payload.usage,
    },
  )
}

function runtimeWarningActivity(event: Extract<ProviderRuntimeEvent, { type: 'runtime.warning' }>) {
  return baseActivity(event, 'info', 'runtime.warning', 'Runtime warning', {
    detail: event.payload.detail,
    message: truncateDetail(event.payload.message),
  })
}

function runtimeErrorActivity(event: Extract<ProviderRuntimeEvent, { type: 'runtime.error' }>) {
  return baseActivity(event, 'error', 'runtime.error', 'Runtime error', {
    class: event.payload.class,
    detail: event.payload.detail,
    message: truncateDetail(event.payload.message),
  })
}

function contextCompactionActivity(
  event: Extract<ProviderRuntimeEvent, { type: 'thread.state.changed' }>,
) {
  if (event.payload.state !== 'compacted') return []

  return [
    baseActivity(event, 'info', 'context-compaction', 'Context compacted', {
      detail: event.payload.detail,
      state: event.payload.state,
    }),
  ]
}

function tokenUsageActivity(
  event: Extract<ProviderRuntimeEvent, { type: 'thread.token-usage.updated' }>,
) {
  if ((event.payload.usage.usedTokens ?? 0) <= 0) return []

  return [
    baseActivity(
      event,
      'info',
      'context-window.updated',
      'Context window updated',
      event.payload.usage,
    ),
  ]
}

function isReasoningStreamKind(streamKind: string) {
  return streamKind === 'reasoning_summary_text' || streamKind === 'reasoning_text'
}

function baseActivity(
  event: Extract<ProviderRuntimeEvent, { createdAt: string; eventId: string; threadId: ThreadId }>,
  tone: OrchestrationThreadActivity['tone'],
  kind: string,
  summary: string,
  payload: unknown,
): OrchestrationThreadActivity {
  return {
    createdAt: event.createdAt,
    id: v.parse(eventIdSchema, event.eventId),
    kind,
    payload: compactPayload(payload),
    summary,
    threadId: event.threadId,
    tone,
    turnId: event.turnId ?? null,
  }
}

function compactPayload(payload: unknown) {
  if (!isPlainRecord(payload)) return payload

  return Object.fromEntries(Object.entries(payload).filter((entry) => entry[1] !== undefined))
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null) return false
  if (typeof value !== 'object') return false

  return !Array.isArray(value)
}

function taskCompletedSummary(event: Extract<ProviderRuntimeEvent, { type: 'task.completed' }>) {
  if (event.payload.status === 'failed') return 'Task failed'
  if (event.payload.status === 'stopped') return 'Task stopped'

  return 'Task completed'
}

function approvalRequestSummary(requestKind: string | undefined) {
  if (requestKind === 'command') return 'Command approval requested'
  if (requestKind === 'file-read') return 'File-read approval requested'
  if (requestKind === 'file-change') return 'File-change approval requested'

  return 'Approval requested'
}

function requestKindFromRequestType(requestType: string) {
  switch (requestType) {
    case 'command_execution_approval':
    case 'exec_command_approval':
      return 'command'
    case 'file_read_approval':
      return 'file-read'
    case 'apply_patch_approval':
    case 'file_change_approval':
      return 'file-change'
    default:
      return undefined
  }
}

function finalizedAssistantText(bufferedText: string, fallbackText: string | undefined) {
  if (bufferedText.length > 0) return bufferedText
  if (!hasRenderableText(fallbackText)) return ''

  return fallbackText ?? ''
}

function hasRenderableText(text: string | undefined) {
  return (text?.trim().length ?? 0) > 0
}

function normalizeProposedPlanMarkdown(planMarkdown: string | undefined) {
  const trimmed = planMarkdown?.trim()
  if (!trimmed) return undefined

  return trimmed
}

function proposedPlanIdFromEvent(event: ProviderRuntimeEvent) {
  if ('planId' in event && event.planId) return event.planId
  if (event.turnId) return proposedPlanIdForTurn(event.threadId, event.turnId)
  if ('itemId' in event && event.itemId) return `plan:${event.threadId}:item:${event.itemId}`

  return `plan:${event.threadId}:event:${event.eventId}`
}

function proposedPlanIdForTurn(threadId: ThreadId, turnId: TurnId) {
  return `plan:${threadId}:turn:${turnId}`
}

function assistantSegmentBaseKey(event: Extract<ProviderRuntimeEvent, { type: 'content.delta' }>) {
  return String(event.itemId ?? event.turnId ?? event.eventId)
}

function providerCommandId(eventId: string, tag: string) {
  return v.parse(commandIdSchema, `provider:${eventId}:${tag}`)
}

function truncateDetail(value: string | undefined, limit = 180) {
  if (value === undefined) return undefined
  if (value.length <= limit) return value

  return `${value.slice(0, limit - 3)}...`
}

function noop() {}
