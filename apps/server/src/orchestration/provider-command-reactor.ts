import { createInternalError } from '../observability/structured-errors'

import type {
  InteractionMode,
  ModelSelection,
  OrchestrationCommand,
  OrchestrationEvent,
  OrchestrationMessage,
  OrchestrationProject,
  OrchestrationThread,
  RuntimeMode,
  ThreadId,
  TurnId,
} from '@workspace/contracts'
import * as v from 'valibot'
import {
  commandIdSchema,
  DEFAULT_CODEX_PROVIDER_SETTINGS,
  DEFAULT_RUNTIME_MODE,
} from '@workspace/contracts'
import type { OrchestrationSessionStatus } from '@workspace/contracts'
import type { ProviderService } from '../provider/provider-service'
import type {
  ProviderSessionRuntimePayload,
  ProviderSessionStartPayload,
} from '../provider/session-payload'
import type { ProviderRuntimeEvent } from '../provider/types'
import type { GitService } from '../git/service'
import { checkpointRefForThreadTurn } from './checkpoint-refs'
import type { OrchestrationReadModel } from './read-model'
import { ProviderRuntimeIngestion } from './provider-runtime-ingestion'
import {
  orchestrationEventBatchSummary,
  orchestrationEventSummary,
  providerRuntimeEventSummary,
  recordChatPipelineInfo,
  recordChatPipelineWarning,
} from './orchestration-logging'

type ProviderIntentEvent = Extract<
  OrchestrationEvent,
  {
    type:
      | 'thread.runtime-mode-set'
      | 'thread.turn-start-requested'
      | 'thread.turn-interrupt-requested'
      | 'thread.session-stop-requested'
      | 'thread.checkpoint-revert-requested'
      | 'thread.approval-response-requested'
      | 'thread.user-input-response-requested'
  }
>

const HANDLED_TURN_START_KEY_MAX = 10_000
const HANDLED_TURN_START_KEY_TTL_MS = 30 * 60 * 1000

export class ProviderCommandReactor {
  /**
   * Settled before a turn reaches the provider. The checkpoint reactor hangs
   * the pre-turn baseline capture here: a photograph of the worktree taken
   * after the agent's first write is worse than no photograph at all, because
   * turn one then diffs against its own output.
   */
  private readonly beforeTurnStart: ((threadId: ThreadId) => Promise<void>) | null
  private readonly checkpointGit: GitService | null
  private readonly dispatch: ((command: OrchestrationCommand) => Promise<unknown> | unknown) | null
  private readonly getReadModel: () => OrchestrationReadModel
  private readonly ingestion: ProviderRuntimeIngestion
  private readonly now: () => number
  private readonly pendingProviderActions = new Set<Promise<void>>()
  private readonly providerService: ProviderService
  private readonly threadModelSelections = new Map<string, ModelSelection>()
  private readonly turnStartKeyTtlMs: number
  private readonly turnStartKeys = new Map<string, number>()
  private readonly worker: DrainableProviderIntentWorker<ProviderIntentEvent>

  constructor({
    beforeTurnStart,
    checkpointGit,
    dispatch,
    getReadModel,
    ingestion,
    now,
    providerService,
    turnStartKeyTtlMs,
  }: {
    beforeTurnStart?: (threadId: ThreadId) => Promise<void>
    checkpointGit?: GitService | null
    dispatch?: (command: OrchestrationCommand) => Promise<unknown> | unknown
    getReadModel: () => OrchestrationReadModel
    ingestion: ProviderRuntimeIngestion
    now?: () => number
    providerService: ProviderService
    turnStartKeyTtlMs?: number
  }) {
    this.beforeTurnStart = beforeTurnStart ?? null
    this.checkpointGit = checkpointGit ?? null
    this.dispatch = dispatch ?? null
    this.getReadModel = getReadModel
    this.ingestion = ingestion
    this.now = now ?? Date.now
    this.providerService = providerService
    this.turnStartKeyTtlMs = turnStartKeyTtlMs ?? HANDLED_TURN_START_KEY_TTL_MS
    this.worker = new DrainableProviderIntentWorker((event) => this.handleEventSafely(event))
    this.providerService.subscribeRuntimeEvents((event) => this.ingestProviderRuntimeEvent(event))
  }

  handleEvents(events: OrchestrationEvent[]) {
    recordChatPipelineInfo('chat.pipeline.provider_reactor.events_received', {
      ...orchestrationEventBatchSummary(events),
    })
    for (const event of events) {
      if (!isProviderIntentEvent(event)) continue

      recordChatPipelineInfo('chat.pipeline.provider_reactor.intent_enqueued', {
        ...orchestrationEventSummary(event),
      })
      this.worker.enqueue(event)
    }
  }

  async drain() {
    for (;;) {
      await this.worker.drain()
      await this.drainProviderActions()
      await this.ingestion.drain()
      if (this.isIdle()) return
    }
  }

  private isIdle() {
    return this.worker.isIdle() && this.pendingProviderActions.size === 0
  }

  private async drainProviderActions() {
    if (this.pendingProviderActions.size === 0) return

    await Promise.all(Array.from(this.pendingProviderActions))
  }

  private async handleEventSafely(event: ProviderIntentEvent) {
    try {
      await this.handleEvent(event)
    } catch (error) {
      recordChatPipelineWarning('chat.pipeline.provider_reactor.intent_failed', {
        ...orchestrationEventSummary(event),
        error,
      })
    }
  }

  private async handleEvent(event: ProviderIntentEvent) {
    recordChatPipelineInfo('chat.pipeline.provider_reactor.intent_start', {
      ...orchestrationEventSummary(event),
    })
    switch (event.type) {
      case 'thread.runtime-mode-set':
        await this.runtimeModeSet(event)
        return
      case 'thread.turn-start-requested':
        await this.startTurn(event)
        return
      case 'thread.turn-interrupt-requested':
        await this.interruptTurn(event)
        return
      case 'thread.session-stop-requested':
        await this.stopSession(event)
        return
      case 'thread.checkpoint-revert-requested':
        await this.revertCheckpoint(event)
        return
      case 'thread.approval-response-requested':
        await this.respondApproval(event)
        return
      case 'thread.user-input-response-requested':
        await this.respondUserInput(event)
        return
    }
  }

  private async startTurn(
    event: Extract<ProviderIntentEvent, { type: 'thread.turn-start-requested' }>,
  ) {
    if (this.hasHandledTurnStart(event)) {
      recordChatPipelineInfo('chat.pipeline.provider_reactor.turn_start.deduped', {
        ...orchestrationEventSummary(event),
      })
      return
    }

    const context = await this.turnContext(event)
    if (!context) {
      recordChatPipelineWarning('chat.pipeline.provider_reactor.turn_start.missing_context', {
        ...orchestrationEventSummary(event),
      })
      return
    }

    try {
      recordChatPipelineInfo('chat.pipeline.provider_reactor.turn_start.context', {
        interactionMode: context.interactionMode,
        messageId: context.message.id,
        model: context.modelSelection.model,
        providerInstanceId: context.modelSelection.providerInstanceId,
        runtimeMode: context.runtimeMode,
        textLength: context.message.text.length,
        threadId: context.thread.id,
        turnId: event.payload.turnId,
      })
      if (context.message.role !== 'user') {
        throw createInternalError(`Provider turn ${event.payload.turnId} requires a user message.`)
      }

      this.rememberModelSelection(context.thread.id, context.modelSelection)
      await this.beforeTurnStart?.(context.thread.id)
      await this.ensureSessionForTurn(context, event.payload.turnId)
      this.trackProviderAction(this.sendTurn(event, context))
    } catch (error) {
      await this.handleTurnFailure(
        event,
        context.thread.id,
        context.modelSelection,
        error,
        context.runtimeMode,
      )
    }
  }

  private async runtimeModeSet(
    event: Extract<ProviderIntentEvent, { type: 'thread.runtime-mode-set' }>,
  ) {
    const context = this.sessionContext(event.payload.threadId, event.payload.runtimeMode)
    if (!context) return
    if (!hasActiveSession(context.thread)) return

    const ensured = await this.providerService.ensureSession({
      providerInstanceId: context.modelSelection.providerInstanceId,
      runtimeMode: context.runtimeMode,
      runtimePayload: runtimePayloadFromSessionContext(context, null),
      threadId: context.thread.id,
    })

    recordChatPipelineInfo('chat.pipeline.provider_reactor.runtime_mode_set.ensured', {
      providerInstanceId: ensured.binding.providerInstanceId,
      reused: ensured.reused,
      runtimeMode: ensured.binding.runtimeMode,
      threadId: context.thread.id,
    })
  }

  private ensureSessionForTurn(context: ProviderTurnContext, turnId: TurnId) {
    return this.providerService.ensureSession({
      providerInstanceId: context.modelSelection.providerInstanceId,
      runtimeMode: context.runtimeMode,
      runtimePayload: runtimePayloadFromSessionContext(context, turnId),
      threadId: context.thread.id,
    })
  }

  private async sendTurn(
    event: Extract<ProviderIntentEvent, { type: 'thread.turn-start-requested' }>,
    context: ProviderTurnContext,
  ) {
    try {
      await this.providerService.sendTurn({
        attachments: context.message.attachments,
        cwd: context.thread.worktreePath ?? context.project.workspaceRoot,
        interactionMode: context.interactionMode,
        messageText: context.message.text,
        modelSelection: context.modelSelection,
        project: context.project,
        providerInstanceId: context.modelSelection.providerInstanceId,
        runtimeMode: context.runtimeMode,
        thread: context.thread,
        turnId: event.payload.turnId,
      })
      recordChatPipelineInfo('chat.pipeline.provider_reactor.turn_start.sent', {
        threadId: context.thread.id,
        turnId: event.payload.turnId,
      })
    } catch (error) {
      await this.handleTurnFailure(
        event,
        context.thread.id,
        context.modelSelection,
        error,
        context.runtimeMode,
      )
    }
  }

  private async interruptTurn(
    event: Extract<ProviderIntentEvent, { type: 'thread.turn-interrupt-requested' }>,
  ) {
    recordChatPipelineInfo('chat.pipeline.provider_reactor.interrupt.start', {
      ...orchestrationEventSummary(event),
    })
    try {
      const binding = await this.providerService.interruptTurn({
        threadId: event.payload.threadId,
        turnId: event.payload.turnId,
      })
      if (!binding) {
        await this.appendProviderFailureActivity({
          detail: noActiveSessionDetail(),
          event,
          kind: 'provider.turn.interrupt.failed',
          summary: 'Provider turn interrupt failed',
        })
        return
      }

      await this.ingestSession({
        providerInstanceId: binding.providerInstanceId,
        providerSessionId: binding.providerSessionId,
        runtimeMode: binding.runtimeMode,
        status: 'interrupted',
        threadId: event.payload.threadId,
        turnId: event.payload.turnId ?? null,
      })
    } catch (error) {
      await this.appendProviderFailureActivity({
        detail: providerErrorMessage(error),
        event,
        kind: 'provider.turn.interrupt.failed',
        summary: 'Provider turn interrupt failed',
      })
    }
  }

  private async stopSession(
    event: Extract<ProviderIntentEvent, { type: 'thread.session-stop-requested' }>,
  ) {
    recordChatPipelineInfo('chat.pipeline.provider_reactor.stop.start', {
      ...orchestrationEventSummary(event),
    })
    try {
      const binding = await this.providerService.stopSession({ threadId: event.payload.threadId })
      if (!binding) {
        recordChatPipelineWarning('chat.pipeline.provider_reactor.stop.missing_binding', {
          ...orchestrationEventSummary(event),
        })
        return
      }

      await this.ingestSession({
        providerInstanceId: binding.providerInstanceId,
        providerSessionId: binding.providerSessionId,
        runtimeMode: binding.runtimeMode,
        status: 'stopped',
        threadId: event.payload.threadId,
        turnId: null,
      })
    } catch (error) {
      await this.appendProviderFailureActivity({
        detail: providerErrorMessage(error),
        event,
        kind: 'provider.session.stop.failed',
        summary: 'Provider session stop failed',
      })
    }
  }

  private async revertCheckpoint(
    event: Extract<ProviderIntentEvent, { type: 'thread.checkpoint-revert-requested' }>,
  ) {
    recordChatPipelineInfo('chat.pipeline.provider_reactor.checkpoint_revert.start', {
      ...orchestrationEventSummary(event),
      turnCount: event.payload.turnCount,
    })
    try {
      const context = this.checkpointRevertContext(event)
      if (!context) {
        await this.appendProviderFailureActivity({
          detail:
            'Checkpoint revert cannot run without a thread, project, Git service, and command dispatcher.',
          event,
          kind: 'checkpoint.revert.failed',
          summary: 'Checkpoint revert failed',
        })
        return
      }

      const restored = await context.git.restoreRef({
        fallbackToHead: event.payload.turnCount === 0,
        path: context.workspacePath,
        ref: context.targetRef,
      })
      if (!restored) {
        throw createInternalError(
          `Checkpoint ref is unavailable for turn ${event.payload.turnCount}.`,
        )
      }

      const rollbackTurns = context.currentTurnCount - event.payload.turnCount
      if (rollbackTurns > 0) {
        await this.providerService.rollbackConversation({
          numTurns: rollbackTurns,
          threadId: event.payload.threadId,
        })
      }

      // The projection prune comes first: `thread.reverted` is what tells every
      // client which checkpoints still exist, and a ref deleted ahead of it
      // leaves the UI offering a diff whose ref is already gone.
      await Promise.resolve(
        context.dispatch({
          commandId: v.parse(commandIdSchema, `checkpoint-revert-complete:${event.eventId}`),
          createdAt: new Date().toISOString(),
          threadId: event.payload.threadId,
          turnCount: event.payload.turnCount,
          type: 'thread.revert.complete',
        }),
      )
      await context.git.deleteRefs({
        path: context.workspacePath,
        refs: context.staleRefs,
      })
      recordChatPipelineInfo('chat.pipeline.provider_reactor.checkpoint_revert.complete', {
        deletedRefCount: context.staleRefs.length,
        rollbackTurns,
        threadId: event.payload.threadId,
        turnCount: event.payload.turnCount,
        // A revert must read as an edit, not as a commit someone prepared. This
        // is the observable for that: anything staged here is the bug.
        ...(await revertedIndexSummary(context.git, context.workspacePath)),
      })
    } catch (error) {
      await this.appendProviderFailureActivity({
        detail: providerErrorMessage(error),
        event,
        kind: 'checkpoint.revert.failed',
        summary: 'Checkpoint revert failed',
      })
    }
  }

  private async respondApproval(
    event: Extract<ProviderIntentEvent, { type: 'thread.approval-response-requested' }>,
  ) {
    try {
      const handled = await this.providerService.respondApproval({
        decision: event.payload.decision,
        requestId: event.payload.requestId,
        threadId: event.payload.threadId,
      })
      if (handled) return

      await this.appendProviderFailureActivity({
        detail: noActiveSessionDetail(),
        event,
        kind: 'provider.approval.respond.failed',
        requestId: event.payload.requestId,
        summary: 'Provider approval response failed',
      })
    } catch (error) {
      await this.appendProviderFailureActivity({
        detail: approvalResponseFailureDetail(error, event.payload.requestId),
        event,
        kind: 'provider.approval.respond.failed',
        requestId: event.payload.requestId,
        summary: 'Provider approval response failed',
      })
    }
  }

  private async respondUserInput(
    event: Extract<ProviderIntentEvent, { type: 'thread.user-input-response-requested' }>,
  ) {
    try {
      const handled = await this.providerService.respondUserInput({
        answers: event.payload.answers,
        requestId: event.payload.requestId,
        threadId: event.payload.threadId,
      })
      if (handled) return

      await this.appendProviderFailureActivity({
        detail: noActiveSessionDetail(),
        event,
        kind: 'provider.user-input.respond.failed',
        requestId: event.payload.requestId,
        summary: 'Provider user input response failed',
      })
    } catch (error) {
      await this.appendProviderFailureActivity({
        detail: userInputResponseFailureDetail(error, event.payload.requestId),
        event,
        kind: 'provider.user-input.respond.failed',
        requestId: event.payload.requestId,
        summary: 'Provider user input response failed',
      })
    }
  }

  private async appendProviderFailureActivity(input: {
    detail: string
    event: ProviderIntentEvent
    kind:
      | 'checkpoint.revert.failed'
      | 'provider.approval.respond.failed'
      | 'provider.session.stop.failed'
      | 'provider.turn.interrupt.failed'
      | 'provider.turn.start.failed'
      | 'provider.user-input.respond.failed'
    requestId?: string
    summary: string
  }) {
    await this.ingestion.ingest({
      createdAt: providerFailureCreatedAt(input.event),
      detail: input.detail,
      eventId: runtimeEventId(input.kind),
      kind: input.kind,
      payload: providerFailurePayload(input.detail, input.requestId),
      summary: input.summary,
      threadId: input.event.payload.threadId,
      tone: 'error',
      turnId: turnIdForProviderFailure(input.event),
      type: 'activity.append',
    })
  }

  private async turnContext(
    event: Extract<ProviderIntentEvent, { type: 'thread.turn-start-requested' }>,
  ) {
    const model = this.getReadModel()
    const thread = model.threads.get(event.payload.threadId)
    if (!thread) return null

    const project = model.projects.get(thread.projectId)
    if (!project) return null

    const message = thread.messages.find((candidate) => candidate.id === event.payload.messageId)
    if (!message) return null

    const modelSelection =
      event.payload.modelSelection ??
      this.threadModelSelections.get(thread.id) ??
      thread.modelSelection

    return {
      interactionMode: event.payload.interactionMode ?? thread.interactionMode,
      message,
      modelSelection,
      project,
      runtimeMode: event.payload.runtimeMode ?? thread.runtimeMode ?? DEFAULT_RUNTIME_MODE,
      thread,
    }
  }

  private async handleTurnFailure(
    event: Extract<ProviderIntentEvent, { type: 'thread.turn-start-requested' }>,
    threadId: ThreadId,
    modelSelection: ModelSelection,
    error: unknown,
    runtimeMode: RuntimeMode,
  ) {
    const detail = providerErrorMessage(error)
    await this.appendProviderFailureActivity({
      detail,
      event,
      kind: 'provider.turn.start.failed',
      summary: 'Provider turn start failed',
    })
    await this.ingestSession({
      lastError: detail,
      providerInstanceId: modelSelection.providerInstanceId,
      providerSessionId: providerSessionId(threadId),
      runtimeMode,
      status: 'error',
      threadId,
      turnId: event.payload.turnId,
    })
  }

  private async ingestSession(input: {
    lastError?: string | null
    providerInstanceId: ModelSelection['providerInstanceId']
    providerSessionId: string | null
    runtimeMode?: RuntimeMode
    status: OrchestrationSessionStatus
    threadId: ThreadId
    turnId: TurnId | null
  }) {
    recordChatPipelineInfo('chat.pipeline.provider_reactor.ingest_session', {
      providerInstanceId: input.providerInstanceId,
      providerSessionId: input.providerSessionId,
      runtimeMode: input.runtimeMode,
      sessionStatus: input.status,
      threadId: input.threadId,
      turnId: input.turnId,
    })
    await this.ingestion.ingest({
      createdAt: new Date().toISOString(),
      eventId: runtimeEventId('provider-session'),
      lastError: input.lastError,
      providerInstanceId: input.providerInstanceId,
      providerName: providerDisplayName(input.providerInstanceId),
      providerSessionId: input.providerSessionId,
      runtimeMode: input.runtimeMode,
      status: input.status,
      threadId: input.threadId,
      turnId: input.turnId,
      type: 'session.set',
    })
  }

  private async ingestProviderRuntimeEvent(event: ProviderRuntimeEvent) {
    recordChatPipelineInfo('chat.pipeline.provider_reactor.runtime_event', {
      ...providerRuntimeEventSummary(event),
    })
    await this.ingestion.ingest(event)
  }

  private hasHandledTurnStart(
    event: Extract<ProviderIntentEvent, { type: 'thread.turn-start-requested' }>,
  ) {
    const now = this.now()
    const key = turnStartKeyForEvent(event)
    this.pruneHandledTurnStartKeys(now)
    const expiresAt = this.turnStartKeys.get(key)
    this.turnStartKeys.set(key, now + this.turnStartKeyTtlMs)
    this.pruneHandledTurnStartKeyCapacity()

    return expiresAt !== undefined && expiresAt > now
  }

  private pruneHandledTurnStartKeys(now: number) {
    for (const [key, expiresAt] of this.turnStartKeys) {
      if (expiresAt > now) continue

      this.turnStartKeys.delete(key)
    }
  }

  private pruneHandledTurnStartKeyCapacity() {
    while (this.turnStartKeys.size > HANDLED_TURN_START_KEY_MAX) {
      const oldestKey = this.turnStartKeys.keys().next().value
      if (!oldestKey) return

      this.turnStartKeys.delete(oldestKey)
    }
  }

  private rememberModelSelection(threadId: ThreadId, modelSelection: ModelSelection) {
    this.threadModelSelections.set(threadId, modelSelection)
  }

  private sessionContext(threadId: ThreadId, runtimeMode: RuntimeMode) {
    const model = this.getReadModel()
    const thread = model.threads.get(threadId)
    if (!thread) return null

    const project = model.projects.get(thread.projectId)
    if (!project) return null

    return {
      interactionMode: thread.interactionMode,
      modelSelection: this.threadModelSelections.get(thread.id) ?? thread.modelSelection,
      project,
      runtimeMode,
      thread,
    }
  }

  private checkpointRevertContext(
    event: Extract<ProviderIntentEvent, { type: 'thread.checkpoint-revert-requested' }>,
  ) {
    const git = this.checkpointGit
    const dispatch = this.dispatch
    if (!git || !dispatch) return null

    const model = this.getReadModel()
    const thread = model.threads.get(event.payload.threadId)
    if (!thread) return null

    const project = model.projects.get(thread.projectId)
    if (!project) return null

    const checkpoints = Object.values(thread.checkpointByTurnId).toSorted(
      (left, right) => left.checkpointTurnCount - right.checkpointTurnCount,
    )
    const currentTurnCount = maxCheckpointTurnCount(checkpoints)
    if (event.payload.turnCount > currentTurnCount) {
      throw createInternalError(
        `Checkpoint ${event.payload.turnCount} is newer than current checkpoint ${currentTurnCount}.`,
      )
    }

    const targetRef = checkpointRefForTurnCount(
      event.payload.threadId,
      event.payload.turnCount,
      checkpoints,
    )
    const staleRefs = checkpoints
      .filter((checkpoint) => checkpoint.checkpointTurnCount > event.payload.turnCount)
      .map((checkpoint) => checkpoint.checkpointRef)

    return {
      currentTurnCount,
      dispatch,
      git,
      staleRefs,
      targetRef,
      workspacePath: workspacePathForCheckpointRevert({
        fallbackWorkspacePath: thread.worktreePath ?? project.workspaceRoot,
        providerPayload: this.providerService.bindingForThread(thread.id)?.runtimePayload,
      }),
    }
  }

  private trackProviderAction(task: Promise<void>) {
    let tracked: Promise<void>
    tracked = task
      .catch((error) => {
        recordChatPipelineWarning('chat.pipeline.provider_reactor.provider_action_failed', {
          error,
        })
      })
      .finally(() => {
        this.pendingProviderActions.delete(tracked)
        recordChatPipelineInfo('chat.pipeline.provider_reactor.task_settled', {
          pendingCount: this.pendingProviderActions.size,
        })
      })
    this.pendingProviderActions.add(tracked)
    recordChatPipelineInfo('chat.pipeline.provider_reactor.task_tracked', {
      pendingCount: this.pendingProviderActions.size,
    })
  }
}

/**
 * Never rejects: the revert already happened, so a failed status read costs a
 * log field and nothing else.
 */
async function revertedIndexSummary(git: GitService, workspacePath: string) {
  try {
    const status = await git.status(workspacePath)
    const staged = status.files.filter((file) => file.index !== 'unmodified')

    return { changedFileCount: status.files.length, stagedFileCount: staged.length }
  } catch (error) {
    return { statusError: providerErrorMessage(error) }
  }
}

function isProviderIntentEvent(event: OrchestrationEvent): event is ProviderIntentEvent {
  switch (event.type) {
    case 'thread.runtime-mode-set':
    case 'thread.turn-start-requested':
    case 'thread.turn-interrupt-requested':
    case 'thread.session-stop-requested':
    case 'thread.checkpoint-revert-requested':
    case 'thread.approval-response-requested':
    case 'thread.user-input-response-requested':
      return true
    default:
      return false
  }
}

function providerSessionId(threadId: ThreadId) {
  return `provider-session:${threadId}`
}

function runtimeEventId(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`
}

function providerErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message

  return String(error)
}

function providerFailurePayload(detail: string, requestId: string | undefined) {
  if (!requestId) return { detail }

  return { detail, requestId }
}

function providerFailureCreatedAt(event: ProviderIntentEvent) {
  if ('createdAt' in event.payload) return event.payload.createdAt

  return event.occurredAt
}

function turnIdForProviderFailure(event: ProviderIntentEvent) {
  if ('turnId' in event.payload) return event.payload.turnId ?? null

  return null
}

function runtimePayloadFromSessionContext(
  context: ProviderSessionContext,
  turnId: TurnId | null,
): ProviderSessionStartPayload {
  return {
    activeTurnId: turnId,
    cwd: context.thread.worktreePath ?? context.project.workspaceRoot,
    interactionMode: context.interactionMode,
    lastError: null,
    modelSelection: context.modelSelection,
    runtimeMode: context.runtimeMode,
  }
}

function hasActiveSession(thread: OrchestrationThread) {
  if (!thread.session) return false

  return thread.session.status !== 'stopped'
}

function maxCheckpointTurnCount(checkpoints: Array<{ checkpointTurnCount: number }>) {
  let maxTurnCount = 0

  for (const checkpoint of checkpoints) {
    maxTurnCount = Math.max(maxTurnCount, checkpoint.checkpointTurnCount)
  }

  return maxTurnCount
}

function checkpointRefForTurnCount(
  threadId: ThreadId,
  turnCount: number,
  checkpoints: Array<{
    checkpointRef: string
    checkpointTurnCount: number
    status: 'ready' | 'missing' | 'error'
  }>,
) {
  if (turnCount === 0) return checkpointRefForThreadTurn(threadId, 0)

  const checkpoint = checkpoints.find((candidate) => candidate.checkpointTurnCount === turnCount)
  if (!checkpoint || checkpoint.status !== 'ready') {
    throw createInternalError(`Checkpoint ref is unavailable for turn ${turnCount}.`)
  }

  return checkpoint.checkpointRef
}

function workspacePathForCheckpointRevert(input: {
  fallbackWorkspacePath: string
  providerPayload: ProviderSessionRuntimePayload | null | undefined
}) {
  return input.providerPayload?.cwd ?? input.fallbackWorkspacePath
}

function turnStartKeyForEvent(
  event: Extract<ProviderIntentEvent, { type: 'thread.turn-start-requested' }>,
) {
  if (event.commandId !== null) return `command:${event.commandId}`

  return `event:${event.eventId}`
}

function noActiveSessionDetail() {
  return 'No active provider session is bound to this thread.'
}

function approvalResponseFailureDetail(error: unknown, requestId: string) {
  const detail = providerErrorMessage(error)
  if (isUnknownPendingApprovalRequestError(detail)) {
    return stalePendingRequestDetail('approval', requestId)
  }

  return detail
}

function userInputResponseFailureDetail(error: unknown, requestId: string) {
  const detail = providerErrorMessage(error)
  if (isUnknownPendingUserInputRequestError(detail)) {
    return stalePendingRequestDetail('user-input', requestId)
  }

  return detail
}

function isUnknownPendingApprovalRequestError(detail: string) {
  const normalized = detail.toLowerCase()
  if (normalized.includes('unknown pending approval request')) return true

  return normalized.includes('unknown pending permission request')
}

function isUnknownPendingUserInputRequestError(detail: string) {
  return detail.toLowerCase().includes('unknown pending user-input request')
}

function stalePendingRequestDetail(requestKind: 'approval' | 'user-input', requestId: string) {
  return `Stale pending ${requestKind} request: ${requestId}. Provider callback state does not survive app restarts or recovered sessions. Restart the turn to continue.`
}

function providerDisplayName(providerInstanceId: ModelSelection['providerInstanceId']) {
  if (providerInstanceId === DEFAULT_CODEX_PROVIDER_SETTINGS.providerInstanceId) {
    return DEFAULT_CODEX_PROVIDER_SETTINGS.displayLabel
  }

  return providerInstanceId
}

class DrainableProviderIntentWorker<Event> {
  private active = false
  private readonly handler: (event: Event) => Promise<void>
  private readonly queue: Event[] = []
  private readonly waiters: Array<() => void> = []

  constructor(handler: (event: Event) => Promise<void>) {
    this.handler = handler
  }

  enqueue(event: Event) {
    this.queue.push(event)
    void this.run()
  }

  isIdle() {
    return !this.active && this.queue.length === 0
  }

  drain() {
    if (this.isIdle()) return Promise.resolve()

    return new Promise<void>((resolve) => {
      this.waiters.push(resolve)
    })
  }

  private async run() {
    if (this.active) return

    this.active = true
    try {
      while (this.queue.length > 0) {
        const event = this.queue.shift() as Event
        await this.handler(event)
      }
    } finally {
      this.active = false
      this.resolveWaitersIfIdle()
      if (this.queue.length > 0) void this.run()
    }
  }

  private resolveWaitersIfIdle() {
    if (!this.isIdle()) return

    const waiters = this.waiters.splice(0)
    for (const waiter of waiters) {
      waiter()
    }
  }
}

type ProviderSessionContext = {
  interactionMode: InteractionMode
  modelSelection: ModelSelection
  project: OrchestrationProject
  runtimeMode: RuntimeMode
  thread: OrchestrationThread
}

type ProviderTurnContext = ProviderSessionContext & {
  message: OrchestrationMessage
}
