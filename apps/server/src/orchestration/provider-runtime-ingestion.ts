import {
  commandIdSchema,
  DEFAULT_RUNTIME_MODE,
  DEFAULT_USER_INPUT_ANSWER_KIND,
  eventIdSchema,
  messageIdSchema,
  proposedPlanIdSchema,
  userInputQuestionOptionSchema,
  userInputQuestionSchema,
  type InternalOrchestrationCommand,
  type OrchestrationCommand,
  type MessageId,
  type OrchestrationSession,
  type OrchestrationThreadActivity,
  type ThreadId,
  type TurnId,
  type UserInputQuestion,
  type UserInputQuestionOption,
} from '@workspace/contracts'
import * as v from 'valibot'
import type { ProviderRuntimeEvent } from '../provider/types'
import { checkpointFilesFromUnifiedDiff } from './checkpoint-files'
import { checkpointRefForThreadTurn } from './checkpoint-refs'
import type { OrchestrationProjectedThread, OrchestrationReadModel } from './read-model'
import {
  BoundedTtlCache,
  PROVIDER_RUNTIME_BUFFER_TTL_MS,
  ProviderRuntimeBuffers,
} from './provider-runtime-buffers'

export type ProviderRuntimeDispatch = (
  command: InternalOrchestrationCommand | OrchestrationCommand,
) => Promise<unknown>
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
  private readonly getReadModel: (() => OrchestrationReadModel) | null
  private readonly onLiveness: ((threadId: ThreadId) => void) | null
  private queue = Promise.resolve()
  private readonly seenEventIds: BoundedTtlCache<string, true>

  constructor(
    dispatch: ProviderRuntimeDispatch,
    options: {
      assistantDeliveryMode?: AssistantDeliveryMode
      buffers?: ProviderRuntimeBuffers
      getReadModel?: () => OrchestrationReadModel
      now?: () => number
      /**
       * Called once per accepted event, before anything is dispatched. This is
       * the signal an idle-session reaper reads: a turn can stream for an hour
       * without a single status transition, so status alone cannot say whether
       * a session is alive.
       */
      onLiveness?: (threadId: ThreadId) => void
    } = {},
  ) {
    this.assistantDeliveryMode = options.assistantDeliveryMode ?? 'streaming'
    this.buffers = options.buffers ?? new ProviderRuntimeBuffers({ now: options.now })
    this.dispatch = dispatch
    this.getReadModel = options.getReadModel ?? null
    this.onLiveness = options.onLiveness ?? null
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
    this.onLiveness?.(event.threadId)
    await this.dispatchSessionCommand(event)
    await this.dispatchMetadataCommands(event)
    await this.dispatchContentCommands(event)
    await this.dispatchCheckpointPlaceholder(event)
    await this.dispatchActivityCommands(event)
  }

  /**
   * A turn's changed files have to appear while the agent is still working, and
   * the only mid-turn signal is the provider's own unified diff. It lands as a
   * checkpoint with status `missing`: the file list is real, the git ref is not
   * written yet. `CheckpointReactor` upgrades the turn to a captured ref when
   * the turn ends, and the projection refuses the reverse — so a placeholder
   * arriving late can never erase a capture.
   */
  private async dispatchCheckpointPlaceholder(event: ProviderRuntimeEvent) {
    if (event.type !== 'turn.diff.updated') return
    if (!event.turnId) return

    const thread = this.getReadModel?.().threads.get(event.threadId)
    if (!thread || thread.deletedAt) return

    const files = checkpointFilesFromUnifiedDiff(event.payload.unifiedDiff)
    if (files.length === 0) return

    const checkpointTurnCount = placeholderCheckpointTurnCount(thread, event.turnId)
    await this.dispatch({
      checkpointRef: checkpointRefForThreadTurn(event.threadId, checkpointTurnCount),
      checkpointTurnCount,
      commandId: providerCommandId(event.eventId, 'turn-diff-placeholder'),
      completedAt: event.createdAt,
      createdAt: event.createdAt,
      files,
      status: 'missing',
      threadId: event.threadId,
      turnId: event.turnId,
      type: 'thread.turn.diff.complete',
    })
  }

  private async dispatchSessionCommand(event: ProviderRuntimeEvent) {
    if (event.type === 'session.set') {
      await this.dispatch(sessionSetCommand(event))
      return
    }

    const session = sessionFromLifecycleEvent(event)
    if (!session) return
    if (!this.shouldApplyLifecycleSession(event)) return

    await this.dispatch({
      commandId: providerCommandId(event.eventId, 'session-set'),
      createdAt: session.updatedAt,
      session: this.sessionForCurrentReadModel(event, session),
      threadId: event.threadId,
      type: 'thread.session.set',
    })
  }

  private async dispatchMetadataCommands(event: ProviderRuntimeEvent) {
    if (event.type !== 'thread.metadata.updated') return
    if (!event.payload.name) return

    await this.dispatch({
      commandId: providerCommandId(event.eventId, 'thread-title-update'),
      threadId: event.threadId,
      title: event.payload.name,
      type: 'thread.meta.update',
    })
  }

  private shouldApplyLifecycleSession(event: ProviderRuntimeEvent) {
    if (!isLifecycleSessionEvent(event)) return true
    if (!event.turnId) return true

    const thread = this.getReadModel?.().threads.get(event.threadId)
    if (!thread?.latestTurn?.turnId) return true

    return thread.latestTurn.turnId === event.turnId
  }

  private sessionForCurrentReadModel(event: ProviderRuntimeEvent, session: OrchestrationSession) {
    const thread = this.getReadModel?.().threads.get(event.threadId)
    if (!thread?.latestTurn) return session
    if (thread.latestTurn.state !== 'running') return session
    if (event.type !== 'session.started' && event.type !== 'thread.started') return session

    return {
      ...session,
      activeTurnId: thread.latestTurn.turnId,
      status: 'running' as const,
    }
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

/**
 * A placeholder claims the slot the real capture will land in, so the ref name
 * it advertises is the one `CheckpointReactor` writes. Reusing an existing
 * slot matters: every mid-turn update of the same turn must describe one
 * checkpoint, not push the turn count forward on each diff frame.
 */
function placeholderCheckpointTurnCount(thread: OrchestrationProjectedThread, turnId: TurnId) {
  const existing = thread.checkpointByTurnId[turnId]
  if (existing) return existing.checkpointTurnCount

  let maxTurnCount = 0
  for (const checkpoint of Object.values(thread.checkpointByTurnId)) {
    maxTurnCount = Math.max(maxTurnCount, checkpoint.checkpointTurnCount)
  }

  return maxTurnCount + 1
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
    case 'item.completed':
      return toolActivity(event, 'tool.completed', event.payload.title ?? 'Tool')
    case 'request.opened':
      return requestOpenedActivity(event)
    case 'request.resolved':
      return requestResolvedActivity(event)
    case 'user-input.requested':
      return [userInputRequestedActivity(event)]
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
    case 'turn.plan.updated':
      return [turnPlanUpdatedActivity(event)]
    case 'turn.diff.updated':
      return [turnDiffUpdatedActivity(event)]
    case 'hook.started':
      return [hookStartedActivity(event)]
    case 'hook.progress':
      return [hookProgressActivity(event)]
    case 'hook.completed':
      return [hookCompletedActivity(event)]
    case 'tool.progress':
      return [toolProgressActivity(event)]
    case 'tool.summary':
      return [toolSummaryActivity(event)]
    case 'auth.status':
      return [authStatusActivity(event)]
    case 'account.updated':
      return [baseActivity(event, 'info', 'account.updated', 'Account updated', event.payload)]
    case 'account.rate-limits.updated':
      return [
        baseActivity(
          event,
          'info',
          'account.rate-limits.updated',
          'Account rate limits updated',
          event.payload,
        ),
      ]
    case 'mcp.status.updated':
      return [
        baseActivity(event, 'info', 'mcp.status.updated', 'MCP status updated', event.payload),
      ]
    case 'mcp.oauth.completed':
      return [mcpOauthCompletedActivity(event)]
    case 'model.rerouted':
      return [modelReroutedActivity(event)]
    case 'config.warning':
      return [configWarningActivity(event)]
    case 'deprecation.notice':
      return [deprecationNoticeActivity(event)]
    case 'files.persisted':
      return [filesPersistedActivity(event)]
    case 'thread.realtime.started':
    case 'thread.realtime.item-added':
    case 'thread.realtime.audio.delta':
    case 'thread.realtime.error':
    case 'thread.realtime.closed':
      return realtimeActivity(event)
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
  event: Extract<ProviderRuntimeEvent, { type: 'item.started' | 'item.completed' }>,
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

function userInputRequestedActivity(
  event: Extract<ProviderRuntimeEvent, { type: 'user-input.requested' }>,
) {
  const { droppedQuestionCount, questions } = normalizeUserInputQuestions(event.payload.questions)

  return baseActivity(event, 'info', 'user-input.requested', 'User input requested', {
    // Widening the activity rather than logging a second line: whoever reads
    // the request also sees how much of it we could not read.
    droppedQuestionCount: droppedQuestionCount === 0 ? undefined : droppedQuestionCount,
    questions,
    requestId: event.requestId,
  })
}

/**
 * Providers disagree on the wire shape — Codex sends `question`/`isOther`/
 * `isSecret` and label-only options — so each question is aligned to the
 * contract and then parsed. A question we still cannot read is dropped, never
 * thrown: an unknown shape costs that question, not the turn.
 */
function normalizeUserInputQuestions(rawQuestions: readonly unknown[]) {
  const questions: UserInputQuestion[] = []
  let droppedQuestionCount = 0

  for (const raw of rawQuestions) {
    const parsed = v.safeParse(userInputQuestionSchema, userInputQuestionCandidate(raw))
    if (!parsed.success) {
      droppedQuestionCount += 1
      continue
    }

    questions.push(parsed.output)
  }

  return { droppedQuestionCount, questions }
}

function userInputQuestionCandidate(raw: unknown) {
  if (!isPlainRecord(raw)) return raw

  const options = userInputQuestionOptions(raw.options)

  return {
    ...raw,
    allowOther: firstBoolean(raw.allowOther, raw.isOther),
    answerKind: userInputAnswerKind(raw.answerKind, options),
    header: firstText(raw.header),
    options,
    prompt: firstText(raw.prompt, raw.question),
    secret: firstBoolean(raw.secret, raw.isSecret),
  }
}

/** An option-less question is a text field; options make it a picker. */
function userInputAnswerKind(rawAnswerKind: unknown, options: readonly UserInputQuestionOption[]) {
  if (rawAnswerKind !== undefined) return rawAnswerKind
  if (options.length > 0) return 'single-select'

  return DEFAULT_USER_INPUT_ANSWER_KIND
}

function userInputQuestionOptions(rawOptions: unknown) {
  if (!Array.isArray(rawOptions)) return []

  const options: UserInputQuestionOption[] = []
  for (const raw of rawOptions) {
    const parsed = v.safeParse(userInputQuestionOptionSchema, userInputQuestionOptionCandidate(raw))
    if (!parsed.success) continue

    options.push(parsed.output)
  }

  return options
}

/** Codex options carry no id, so the label doubles as the value sent back. */
function userInputQuestionOptionCandidate(raw: unknown) {
  if (!isPlainRecord(raw)) return raw

  return {
    ...raw,
    description: firstText(raw.description),
    label: firstText(raw.label, raw.value),
    value: firstText(raw.value, raw.label),
  }
}

/** Blank counts as absent: Codex sends `""` where it has no header or description. */
function firstText(...values: readonly unknown[]) {
  for (const value of values) {
    if (typeof value !== 'string') continue
    if (value.trim().length === 0) continue

    return value
  }

  return undefined
}

function firstBoolean(...values: readonly unknown[]) {
  for (const value of values) {
    if (typeof value !== 'boolean') continue

    return value
  }

  return undefined
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

function turnPlanUpdatedActivity(
  event: Extract<ProviderRuntimeEvent, { type: 'turn.plan.updated' }>,
) {
  return baseActivity(event, 'thinking', 'turn.plan.updated', 'Plan updated', {
    explanation: truncateDetail(event.payload.explanation ?? undefined),
    plan: event.payload.plan,
  })
}

function turnDiffUpdatedActivity(
  event: Extract<ProviderRuntimeEvent, { type: 'turn.diff.updated' }>,
) {
  return baseActivity(event, 'tool', 'turn.diff.updated', 'Diff updated', {
    unifiedDiff: truncateDetail(event.payload.unifiedDiff, 600),
  })
}

function hookStartedActivity(event: Extract<ProviderRuntimeEvent, { type: 'hook.started' }>) {
  return baseActivity(event, 'tool', 'hook.started', `${event.payload.hookName} started`, {
    hookEvent: event.payload.hookEvent,
    hookId: event.payload.hookId,
    hookName: event.payload.hookName,
  })
}

function hookProgressActivity(event: Extract<ProviderRuntimeEvent, { type: 'hook.progress' }>) {
  return baseActivity(event, 'tool', 'hook.progress', 'Hook output', {
    hookId: event.payload.hookId,
    output: truncateDetail(event.payload.output),
    stderr: truncateDetail(event.payload.stderr),
    stdout: truncateDetail(event.payload.stdout),
  })
}

function hookCompletedActivity(event: Extract<ProviderRuntimeEvent, { type: 'hook.completed' }>) {
  return baseActivity(
    event,
    event.payload.outcome === 'error' ? 'error' : 'tool',
    'hook.completed',
    event.payload.outcome === 'error' ? 'Hook failed' : 'Hook completed',
    {
      exitCode: event.payload.exitCode,
      hookId: event.payload.hookId,
      outcome: event.payload.outcome,
      output: truncateDetail(event.payload.output),
      stderr: truncateDetail(event.payload.stderr),
      stdout: truncateDetail(event.payload.stdout),
    },
  )
}

function toolProgressActivity(event: Extract<ProviderRuntimeEvent, { type: 'tool.progress' }>) {
  return baseActivity(event, 'tool', 'tool.progress', event.payload.summary ?? 'Tool progress', {
    elapsedSeconds: event.payload.elapsedSeconds,
    summary: truncateDetail(event.payload.summary),
    toolName: event.payload.toolName,
    toolUseId: event.payload.toolUseId,
  })
}

function toolSummaryActivity(event: Extract<ProviderRuntimeEvent, { type: 'tool.summary' }>) {
  return baseActivity(event, 'tool', 'tool.summary', event.payload.summary, {
    precedingToolUseIds: event.payload.precedingToolUseIds,
    summary: truncateDetail(event.payload.summary),
  })
}

function authStatusActivity(event: Extract<ProviderRuntimeEvent, { type: 'auth.status' }>) {
  return baseActivity(
    event,
    event.payload.error ? 'error' : 'info',
    'auth.status',
    event.payload.error ? 'Authentication failed' : 'Authentication status updated',
    event.payload,
  )
}

function mcpOauthCompletedActivity(
  event: Extract<ProviderRuntimeEvent, { type: 'mcp.oauth.completed' }>,
) {
  return baseActivity(
    event,
    event.payload.success ? 'info' : 'error',
    'mcp.oauth.completed',
    event.payload.success ? 'MCP OAuth completed' : 'MCP OAuth failed',
    event.payload,
  )
}

function modelReroutedActivity(event: Extract<ProviderRuntimeEvent, { type: 'model.rerouted' }>) {
  return baseActivity(event, 'info', 'model.rerouted', 'Model rerouted', event.payload)
}

function configWarningActivity(event: Extract<ProviderRuntimeEvent, { type: 'config.warning' }>) {
  return baseActivity(event, 'error', 'config.warning', event.payload.summary, event.payload)
}

function deprecationNoticeActivity(
  event: Extract<ProviderRuntimeEvent, { type: 'deprecation.notice' }>,
) {
  return baseActivity(event, 'info', 'deprecation.notice', event.payload.summary, event.payload)
}

function filesPersistedActivity(event: Extract<ProviderRuntimeEvent, { type: 'files.persisted' }>) {
  return baseActivity(event, 'info', 'files.persisted', 'Files persisted', event.payload)
}

function realtimeActivity(
  event: Extract<
    ProviderRuntimeEvent,
    {
      type:
        | 'thread.realtime.audio.delta'
        | 'thread.realtime.closed'
        | 'thread.realtime.error'
        | 'thread.realtime.item-added'
        | 'thread.realtime.started'
    }
  >,
) {
  if (event.type === 'thread.realtime.audio.delta') return []

  return [
    baseActivity(
      event,
      event.type === 'thread.realtime.error' ? 'error' : 'info',
      event.type,
      realtimeSummary(event.type),
      event.payload,
    ),
  ]
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

function realtimeSummary(type: string) {
  switch (type) {
    case 'thread.realtime.started':
      return 'Realtime session started'
    case 'thread.realtime.item-added':
      return 'Realtime item added'
    case 'thread.realtime.closed':
      return 'Realtime session closed'
    case 'thread.realtime.error':
      return 'Realtime error'
    default:
      return 'Realtime event'
  }
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

function approvalRequestSummary(requestKind: ApprovalRequestKind) {
  switch (requestKind) {
    case 'command':
      return 'Command approval requested'
    case 'file-read':
      return 'File-read approval requested'
    case 'file-change':
      return 'File-change approval requested'
    case 'tool':
      return 'Tool approval requested'
  }
}

type ApprovalRequestKind = 'command' | 'file-change' | 'file-read' | 'tool'

/**
 * Every `request.opened` blocks the turn until it is answered, so an
 * unrecognised type falls back to the generic tool kind. Leaving it undefined
 * used to hide MCP and custom-tool approvals (Claude's
 * `dynamic_tool_call_approval`) from the panel while they still blocked.
 */
function requestKindFromRequestType(requestType: string): ApprovalRequestKind {
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
      return 'tool'
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
