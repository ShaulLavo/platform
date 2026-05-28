import type {
  ModelSelection,
  OrchestrationEvent,
  RuntimeMode,
  ThreadId,
  TurnId,
} from '@workspace/contracts'
import {
  DEFAULT_CODEX_PROVIDER_SETTINGS,
  DEFAULT_PROVIDER_INSTANCE_ID,
  DEFAULT_RUNTIME_MODE,
  providerInstanceIdSchema,
} from '@workspace/contracts'
import * as v from 'valibot'
import type { ProviderRegistry } from '../provider/registry'
import type { ProviderRuntimeEvent } from '../provider/types'
import type { OrchestrationReadModel } from './read-model'
import { ProviderRuntimeIngestion } from './provider-runtime-ingestion'
import { ProviderRuntimeReceipts } from './runtime-receipts'

type ProviderIntentEvent = Extract<
  OrchestrationEvent,
  {
    type:
      | 'thread.turn-start-requested'
      | 'thread.turn-interrupt-requested'
      | 'thread.session-stop-requested'
      | 'thread.approval-response-requested'
      | 'thread.user-input-response-requested'
  }
>

const HANDLED_TURN_START_KEY_MAX = 10_000

export class ProviderCommandReactor {
  private readonly getReadModel: () => OrchestrationReadModel
  private readonly ingestion: ProviderRuntimeIngestion
  private readonly pending = new Set<Promise<void>>()
  private readonly registry: ProviderRegistry
  private readonly receipts: ProviderRuntimeReceipts
  private readonly turnStartKeys: string[] = []
  private readonly turnStartKeySet = new Set<string>()

  constructor({
    getReadModel,
    ingestion,
    receipts,
    registry,
  }: {
    getReadModel: () => OrchestrationReadModel
    ingestion: ProviderRuntimeIngestion
    receipts: ProviderRuntimeReceipts
    registry: ProviderRegistry
  }) {
    this.getReadModel = getReadModel
    this.ingestion = ingestion
    this.receipts = receipts
    this.registry = registry
  }

  handleEvents(events: OrchestrationEvent[]) {
    for (const event of events) {
      if (!isProviderIntentEvent(event)) continue

      this.track(this.handleEvent(event))
    }
  }

  async drain() {
    await Promise.all(Array.from(this.pending))
  }

  private async handleEvent(event: ProviderIntentEvent) {
    switch (event.type) {
      case 'thread.turn-start-requested':
        await this.startTurn(event)
        return
      case 'thread.turn-interrupt-requested':
        await this.interruptTurn(event)
        return
      case 'thread.session-stop-requested':
        await this.stopSession(event)
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
    if (this.hasHandledTurnStart(event)) return

    const context = await this.turnContext(event)
    if (!context) return

    this.receipts.upsert({
      adapterKey: context.adapter.adapterKey,
      providerDriverKind: context.adapter.driverKind,
      providerInstanceId: context.modelSelection.providerInstanceId,
      providerSessionId: providerSessionId(context.thread.id),
      runtimeMode: context.runtimeMode,
      status: 'starting',
      threadId: context.thread.id,
    })
    await this.ingestSession({
      providerInstanceId: context.modelSelection.providerInstanceId,
      providerSessionId: providerSessionId(context.thread.id),
      runtimeMode: context.runtimeMode,
      status: 'starting',
      threadId: context.thread.id,
      turnId: event.payload.turnId,
    })

    try {
      await context.adapter.startTurn(
        {
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
        },
        { ingest: (runtimeEvent) => this.ingestProviderRuntimeEvent(runtimeEvent) },
      )
      this.receipts.markRunningIfActive(context.thread.id)
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
    const binding = this.receipts.find(event.payload.threadId)
    const providerInstanceId = providerInstanceIdFromBinding(binding?.providerInstanceId)
    const adapter = this.adapterForBinding(providerInstanceId)
    if (!adapter) return

    await adapter.interruptTurn({
      threadId: event.payload.threadId,
      turnId: event.payload.turnId,
    })
    this.receipts.markStatus(event.payload.threadId, 'stopped')
    await this.ingestSession({
      providerInstanceId,
      providerSessionId: binding?.providerSessionId ?? null,
      runtimeMode: binding?.runtimeMode ?? DEFAULT_RUNTIME_MODE,
      status: 'interrupted',
      threadId: event.payload.threadId,
      turnId: event.payload.turnId ?? null,
    })
  }

  private async stopSession(
    event: Extract<ProviderIntentEvent, { type: 'thread.session-stop-requested' }>,
  ) {
    const binding = this.receipts.find(event.payload.threadId)
    const providerInstanceId = providerInstanceIdFromBinding(binding?.providerInstanceId)
    const adapter = this.adapterForBinding(providerInstanceId)
    if (!adapter) return

    await adapter.stopSession({ threadId: event.payload.threadId })
    this.receipts.markStatus(event.payload.threadId, 'stopped')
    await this.ingestSession({
      providerInstanceId,
      providerSessionId: binding?.providerSessionId ?? null,
      runtimeMode: binding?.runtimeMode ?? DEFAULT_RUNTIME_MODE,
      status: 'stopped',
      threadId: event.payload.threadId,
      turnId: null,
    })
  }

  private async respondApproval(
    event: Extract<ProviderIntentEvent, { type: 'thread.approval-response-requested' }>,
  ) {
    const adapter = this.adapterForThread(event.payload.threadId)
    if (!adapter) return

    try {
      await adapter.respondApproval({
        decision: event.payload.decision,
        requestId: event.payload.requestId,
        threadId: event.payload.threadId,
      })
    } catch (error) {
      await this.appendProviderFailureActivity({
        detail: providerErrorMessage(error),
        event,
        kind: 'provider.approval.respond.failed',
        requestId: event.payload.requestId,
        summary: 'Approval response failed',
      })
    }
  }

  private async respondUserInput(
    event: Extract<ProviderIntentEvent, { type: 'thread.user-input-response-requested' }>,
  ) {
    const adapter = this.adapterForThread(event.payload.threadId)
    if (!adapter) return

    try {
      await adapter.respondUserInput({
        answers: event.payload.answers,
        requestId: event.payload.requestId,
        threadId: event.payload.threadId,
      })
    } catch (error) {
      await this.appendProviderFailureActivity({
        detail: providerErrorMessage(error),
        event,
        kind: 'provider.user-input.respond.failed',
        requestId: event.payload.requestId,
        summary: 'User input response failed',
      })
    }
  }

  private async appendProviderFailureActivity(input: {
    detail: string
    event: ProviderIntentEvent
    kind:
      | 'provider.approval.respond.failed'
      | 'provider.turn.failed'
      | 'provider.user-input.respond.failed'
    requestId?: string
    summary: string
  }) {
    await this.ingestion.ingest({
      createdAt: new Date().toISOString(),
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

    const modelSelection = event.payload.modelSelection ?? thread.modelSelection
    const adapter = this.registry.adapter(modelSelection.providerInstanceId)
    if (!adapter) {
      await this.handleMissingProvider(event, modelSelection)
      return null
    }

    return {
      adapter,
      interactionMode: event.payload.interactionMode ?? thread.interactionMode,
      message,
      modelSelection,
      project,
      runtimeMode: event.payload.runtimeMode ?? thread.runtimeMode ?? DEFAULT_RUNTIME_MODE,
      thread,
    }
  }

  private async handleMissingProvider(
    event: Extract<ProviderIntentEvent, { type: 'thread.turn-start-requested' }>,
    modelSelection: ModelSelection,
  ) {
    await this.handleTurnFailure(
      event,
      event.payload.threadId,
      modelSelection,
      new Error(`Provider instance not found: ${modelSelection.providerInstanceId}`),
      event.payload.runtimeMode ?? DEFAULT_RUNTIME_MODE,
    )
  }

  private async handleTurnFailure(
    event: Extract<ProviderIntentEvent, { type: 'thread.turn-start-requested' }>,
    threadId: ThreadId,
    modelSelection: ModelSelection,
    error: unknown,
    runtimeMode: RuntimeMode,
  ) {
    const detail = providerErrorMessage(error)
    this.receipts.markStatus(threadId, 'error')
    await this.appendProviderFailureActivity({
      detail,
      event,
      kind: 'provider.turn.failed',
      summary: 'Provider turn failed',
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
    status: 'starting' | 'running' | 'ready' | 'interrupted' | 'stopped' | 'error'
    threadId: ThreadId
    turnId: TurnId | null
  }) {
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
    await this.ingestion.ingest(event)
  }

  private hasHandledTurnStart(
    event: Extract<ProviderIntentEvent, { type: 'thread.turn-start-requested' }>,
  ) {
    const key = event.commandId ? `command:${event.commandId}` : `event:${event.eventId}`
    if (this.turnStartKeySet.has(key)) return true

    this.turnStartKeySet.add(key)
    this.turnStartKeys.push(key)
    if (this.turnStartKeys.length <= HANDLED_TURN_START_KEY_MAX) return false

    const expired = this.turnStartKeys.shift()
    if (expired) this.turnStartKeySet.delete(expired)

    return false
  }

  private adapterForBinding(providerInstanceId: ModelSelection['providerInstanceId']) {
    return this.registry.adapter(providerInstanceId)
  }

  private adapterForThread(threadId: ThreadId) {
    const binding = this.receipts.find(threadId)
    const providerInstanceId = providerInstanceIdFromBinding(binding?.providerInstanceId)

    return this.adapterForBinding(providerInstanceId)
  }

  private track(task: Promise<void>) {
    this.pending.add(task)
    void task.then(noop, noop).finally(() => this.pending.delete(task))
  }
}

function isProviderIntentEvent(event: OrchestrationEvent): event is ProviderIntentEvent {
  switch (event.type) {
    case 'thread.turn-start-requested':
    case 'thread.turn-interrupt-requested':
    case 'thread.session-stop-requested':
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

function turnIdForProviderFailure(event: ProviderIntentEvent) {
  if ('turnId' in event.payload) return event.payload.turnId ?? null

  return null
}

function providerInstanceIdFromBinding(value: string | null | undefined) {
  return v.parse(providerInstanceIdSchema, value ?? DEFAULT_PROVIDER_INSTANCE_ID)
}

function providerDisplayName(providerInstanceId: ModelSelection['providerInstanceId']) {
  if (providerInstanceId === DEFAULT_CODEX_PROVIDER_SETTINGS.providerInstanceId) {
    return DEFAULT_CODEX_PROVIDER_SETTINGS.displayLabel
  }

  return providerInstanceId
}

function noop() {}
