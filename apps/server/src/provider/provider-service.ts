import { createInternalError } from '../observability/structured-errors'

import type {
  InteractionMode,
  ModelSelection,
  ProviderInstanceId,
  ProviderSnapshot,
  RuntimeMode,
  ThreadId,
  TurnId,
} from '@workspace/contracts'
import { DEFAULT_RUNTIME_MODE } from '@workspace/contracts'
import type {
  ProviderAdapterRegistry,
  ProviderInstanceRoutingInfo,
} from './provider-adapter-registry'
import { createDefaultProviderAdapterRegistry } from './provider-adapter-registry'
import {
  ProviderSessionDirectory,
  type ProviderRuntimeBindingStatus,
  type ProviderRuntimeBindingWithMetadata,
} from './provider-session-directory'
import {
  providerBindingSummary,
  providerRuntimeEventSummary,
  providerTurnControlSummary,
  providerTurnSummary,
  recordChatPipelineInfo,
  recordChatPipelineWarning,
} from '../orchestration/orchestration-logging'
import type {
  ProviderApprovalResponseInput,
  ProviderAdapterSession,
  ProviderRuntimeEvent,
  ProviderSessionStartInput,
  ProviderTurnControlInput,
  ProviderTurnInput,
  ProviderUserInputResponseInput,
} from './types'

export type ProviderServiceOptions = {
  adapterRegistry?: ProviderAdapterRegistry
  sessionDirectory?: ProviderSessionDirectory
}

export type ProviderStartSessionInput = {
  providerInstanceId: ProviderInstanceId
  providerSessionId?: string | null
  resumeCursor?: unknown | null
  runtimeMode: RuntimeMode
  runtimePayload?: unknown | null
  status?: ProviderRuntimeBindingStatus
  threadId: ThreadId
}

export type ProviderSessionRuntimePayload = {
  activeTurnId?: TurnId | null
  cwd?: string
  interactionMode?: InteractionMode
  lastError?: string | null
  lastRuntimeEvent?: string
  modelSelection?: ModelSelection
  runtimeMode?: RuntimeMode
}

export type ProviderEnsureSessionInput = {
  providerInstanceId: ProviderInstanceId
  runtimeMode: RuntimeMode
  runtimePayload: ProviderSessionRuntimePayload
  status?: ProviderRuntimeBindingStatus
  threadId: ThreadId
}

export type ProviderEnsureSessionResult = {
  binding: ProviderRuntimeBindingWithMetadata
  reused: boolean
}

export type ProviderRuntimeEventListener = (event: ProviderRuntimeEvent) => Promise<void> | void

export class ProviderService {
  private readonly adapterRegistry: ProviderAdapterRegistry
  private readonly runtimeEventListeners = new Set<ProviderRuntimeEventListener>()
  private readonly sessionDirectory: ProviderSessionDirectory
  private readonly streamedProviderInstances = new Set<ProviderInstanceId>()

  constructor(options: ProviderServiceOptions = {}) {
    this.adapterRegistry = options.adapterRegistry ?? createDefaultProviderAdapterRegistry()
    this.sessionDirectory = options.sessionDirectory ?? new ProviderSessionDirectory()
    this.startAdapterEventStreams()
  }

  async startSession(input: ProviderStartSessionInput) {
    recordChatPipelineInfo('chat.pipeline.provider_service.start_session.start', {
      providerInstanceId: input.providerInstanceId,
      runtimeMode: input.runtimeMode,
      status: input.status ?? 'starting',
      threadId: input.threadId,
    })
    const adapter = this.adapterRegistry.getByInstance(input.providerInstanceId)
    const session = await adapter.startSession(
      providerSessionStartInput(input, runtimePayloadRecord(input.runtimePayload)),
    )
    const binding = this.sessionDirectory.upsert({
      adapterKey: adapter.adapterKey,
      providerDriverKind: adapter.driverKind,
      providerInstanceId: input.providerInstanceId,
      providerSessionId: input.providerSessionId ?? session.providerSessionId,
      resumeCursor: session.resumeCursor ?? input.resumeCursor ?? null,
      runtimeMode: input.runtimeMode,
      runtimePayload: {
        ...runtimePayloadRecord(input.runtimePayload),
        providerThreadId: session.providerThreadId ?? null,
      },
      status: providerBindingStatusFromSession(session.status, input.status),
      threadId: input.threadId,
    })
    recordChatPipelineInfo('chat.pipeline.provider_service.start_session.complete', {
      ...providerBindingSummary(binding),
    })

    return binding
  }

  async ensureSession(input: ProviderEnsureSessionInput): Promise<ProviderEnsureSessionResult> {
    recordChatPipelineInfo('chat.pipeline.provider_service.ensure_session.start', {
      model: input.runtimePayload.modelSelection?.model,
      providerInstanceId: input.providerInstanceId,
      runtimeMode: input.runtimeMode,
      threadId: input.threadId,
    })
    const adapter = this.adapterRegistry.getByInstance(input.providerInstanceId)
    const existing = this.sessionDirectory.getBinding(input.threadId)
    const reusableBinding = canReuseProviderBinding(existing, input, adapter) ? existing : null
    const activeReusableBinding = reusableBinding
      ? await activeProviderBinding(adapter, reusableBinding)
      : null
    if (activeReusableBinding) {
      const binding = this.sessionDirectory.upsert({
        ...bindingForUpsert(activeReusableBinding),
        runtimePayload: input.runtimePayload,
        status: input.status ?? activeReusableBinding.status,
      })
      recordChatPipelineInfo('chat.pipeline.provider_service.ensure_session.complete', {
        ...providerBindingSummary(binding),
        reused: true,
      })

      return { binding, reused: true }
    }

    await this.stopReplacedBinding(existing, input.providerInstanceId)
    const session = await adapter.startSession(
      providerSessionStartInput(input, runtimePayloadRecord(input.runtimePayload), reusableBinding),
    )
    const binding = this.sessionDirectory.upsert({
      adapterKey: adapter.adapterKey,
      providerDriverKind: adapter.driverKind,
      providerInstanceId: input.providerInstanceId,
      providerSessionId: session.providerSessionId,
      resumeCursor: session.resumeCursor ?? reusableBinding?.resumeCursor ?? null,
      runtimeMode: input.runtimeMode,
      runtimePayload: {
        ...input.runtimePayload,
        providerThreadId: session.providerThreadId ?? null,
      },
      status: providerBindingStatusFromSession(session.status, input.status),
      threadId: input.threadId,
    })

    recordChatPipelineInfo('chat.pipeline.provider_service.ensure_session.complete', {
      ...providerBindingSummary(binding),
      reused: false,
    })

    return { binding, reused: false }
  }

  async sendTurn(input: ProviderTurnInput) {
    const startedAt = performance.now()
    recordChatPipelineInfo(
      'chat.pipeline.provider_service.send_turn.start',
      providerTurnSummary(input),
    )
    const adapter = this.adapterRegistry.getByInstance(input.providerInstanceId)

    try {
      this.sessionDirectory.markStatus(input.thread.id, 'running')
      await adapter.sendTurn(input)
      await settleAdapterRuntimeEvents()
      recordChatPipelineInfo('chat.pipeline.provider_service.send_turn.complete', {
        ...providerTurnSummary(input),
        durationMs: elapsedMs(startedAt),
      })
    } catch (error) {
      this.markTurnFailed(input, error)
      recordChatPipelineWarning('chat.pipeline.provider_service.send_turn.failed', {
        ...providerTurnSummary(input),
        durationMs: elapsedMs(startedAt),
        error,
      })
      throw error
    }
  }

  async interruptTurn(input: ProviderTurnControlInput) {
    recordChatPipelineInfo('chat.pipeline.provider_service.interrupt.start', {
      ...providerTurnControlSummary(input),
    })
    const routed = this.routeThread(input.threadId)
    if (!routed) {
      recordChatPipelineWarning('chat.pipeline.provider_service.interrupt.missing_binding', {
        ...providerTurnControlSummary(input),
      })
      return null
    }

    await routed.adapter.interruptTurn(input)
    const binding = this.sessionDirectory.upsert({
      ...bindingForUpsert(routed.binding),
      runtimePayload: { activeTurnId: null },
      status: 'ready',
    })
    recordChatPipelineInfo('chat.pipeline.provider_service.interrupt.complete', {
      ...providerBindingSummary(binding),
      ...providerTurnControlSummary(input),
    })

    return binding
  }

  async stopSession(input: { threadId: ThreadId }) {
    recordChatPipelineInfo('chat.pipeline.provider_service.stop.start', input)
    const routed = this.routeThread(input.threadId)
    if (!routed) {
      recordChatPipelineWarning('chat.pipeline.provider_service.stop.missing_binding', input)
      return null
    }

    await routed.adapter.stopSession(input)
    const binding = this.sessionDirectory.upsert({
      ...bindingForUpsert(routed.binding),
      runtimePayload: { activeTurnId: null },
      status: 'stopped',
    })
    recordChatPipelineInfo('chat.pipeline.provider_service.stop.complete', {
      ...providerBindingSummary(binding),
    })

    return binding
  }

  async respondApproval(input: ProviderApprovalResponseInput) {
    recordChatPipelineInfo('chat.pipeline.provider_service.approval.start', {
      requestId: input.requestId,
      threadId: input.threadId,
    })
    const routed = this.routeThread(input.threadId)
    if (!routed) {
      recordChatPipelineWarning('chat.pipeline.provider_service.approval.missing_binding', {
        requestId: input.requestId,
        threadId: input.threadId,
      })
      return false
    }

    await routed.adapter.respondApproval(input)
    recordChatPipelineInfo('chat.pipeline.provider_service.approval.complete', {
      requestId: input.requestId,
      threadId: input.threadId,
    })
    return true
  }

  async respondUserInput(input: ProviderUserInputResponseInput) {
    recordChatPipelineInfo('chat.pipeline.provider_service.user_input.start', {
      requestId: input.requestId,
      threadId: input.threadId,
    })
    const routed = this.routeThread(input.threadId)
    if (!routed) {
      recordChatPipelineWarning('chat.pipeline.provider_service.user_input.missing_binding', {
        requestId: input.requestId,
        threadId: input.threadId,
      })
      return false
    }

    await routed.adapter.respondUserInput(input)
    recordChatPipelineInfo('chat.pipeline.provider_service.user_input.complete', {
      requestId: input.requestId,
      threadId: input.threadId,
    })
    return true
  }

  listSessions() {
    return this.sessionDirectory.listBindings().filter(isActiveBinding)
  }

  getCapabilities(providerInstanceId: ProviderInstanceId): Promise<ProviderSnapshot['traits']> {
    return this.adapterRegistry.snapshot(providerInstanceId).then((snapshot) => snapshot.traits)
  }

  getInstanceRoutingInfo(
    providerInstanceId: ProviderInstanceId,
  ): Promise<ProviderInstanceRoutingInfo> {
    return this.adapterRegistry.getInstanceRoutingInfo(providerInstanceId)
  }

  async rollbackConversation(input: { numTurns: number; threadId: ThreadId }) {
    if (input.numTurns === 0) return Promise.resolve()
    const routed = this.routeThread(input.threadId)
    if (!routed)
      throw createInternalError(`No active provider session is bound to thread ${input.threadId}.`)

    await routed.adapter.rollbackThread(input)
  }

  subscribeRuntimeEvents(listener: ProviderRuntimeEventListener) {
    this.runtimeEventListeners.add(listener)

    return () => this.runtimeEventListeners.delete(listener)
  }

  bindingForThread(threadId: ThreadId) {
    return this.sessionDirectory.getBinding(threadId)
  }

  private routeThread(threadId: ThreadId) {
    const binding = this.sessionDirectory.getBinding(threadId)
    if (!binding) return null

    const adapter = this.adapterRegistry.getByInstance(binding.providerInstanceId)

    return { adapter, binding }
  }

  private startAdapterEventStreams() {
    for (const providerInstanceId of this.adapterRegistry.listInstances()) {
      this.startAdapterEventStream(providerInstanceId)
    }
    this.adapterRegistry.subscribeChanges((change) => {
      for (const providerInstanceId of change.providerInstanceIds) {
        this.startAdapterEventStream(providerInstanceId)
      }
    })
  }

  private startAdapterEventStream(providerInstanceId: ProviderInstanceId) {
    if (this.streamedProviderInstances.has(providerInstanceId)) return

    const adapter = this.adapterRegistry.getByInstance(providerInstanceId)
    this.streamedProviderInstances.add(providerInstanceId)
    void this.consumeAdapterEvents(adapter).catch((error) => {
      this.streamedProviderInstances.delete(providerInstanceId)
      recordChatPipelineWarning('chat.pipeline.provider_service.runtime_stream.failed', {
        adapterKey: adapter.adapterKey,
        error,
        providerInstanceId,
      })
    })
  }

  private async consumeAdapterEvents(
    adapter: ReturnType<ProviderAdapterRegistry['getByInstance']>,
  ) {
    for await (const event of adapter.streamEvents()) {
      this.recordRuntimeEvent(event, adapter)
      await this.emitRuntimeEvent(event)
    }
  }

  private async stopReplacedBinding(
    binding: ProviderRuntimeBindingWithMetadata | null,
    nextProviderInstanceId: ProviderInstanceId,
  ) {
    if (!binding) return
    if (!isActiveBinding(binding)) return
    if (binding.providerInstanceId === nextProviderInstanceId) return

    const adapter = this.adapterRegistry.adapter(binding.providerInstanceId)
    if (!adapter) return

    await adapter.stopSession({ threadId: binding.threadId }).catch((error) => {
      recordChatPipelineWarning('chat.pipeline.provider_service.stop_replaced.failed', {
        error,
        providerInstanceId: binding.providerInstanceId,
        threadId: binding.threadId,
      })
    })
  }

  private markTurnFailed(input: ProviderTurnInput, error: unknown) {
    const binding = this.sessionDirectory.getBinding(input.thread.id)
    if (!binding) return

    this.sessionDirectory.upsert({
      ...bindingForUpsert(binding),
      runtimePayload: { activeTurnId: null, lastError: providerErrorMessage(error) },
      status: 'error',
    })
  }

  private recordRuntimeEvent(
    event: ProviderRuntimeEvent,
    streamAdapter?: ReturnType<ProviderAdapterRegistry['getByInstance']>,
  ) {
    recordChatPipelineInfo('chat.pipeline.provider_service.runtime_event', {
      ...providerRuntimeEventSummary(event),
    })
    const update = bindingUpdateFromRuntimeEvent(event)
    if (!update) return

    const adapter = streamAdapter ?? this.adapterRegistry.adapter(update.providerInstanceId)
    if (!adapter) return

    this.sessionDirectory.upsert({
      adapterKey: adapter.adapterKey,
      providerDriverKind: adapter.driverKind,
      providerInstanceId: update.providerInstanceId,
      providerSessionId: update.providerSessionId,
      resumeCursor: update.resumeCursor,
      runtimeMode: update.runtimeMode,
      runtimePayload: {
        activeTurnId: update.activeTurnId,
        lastError: update.lastError,
        lastRuntimeEvent: event.type,
        providerThreadId: update.providerThreadId,
      },
      status: update.status,
      threadId: update.threadId,
    })
  }

  private async emitRuntimeEvent(event: ProviderRuntimeEvent) {
    recordChatPipelineInfo('chat.pipeline.provider_service.runtime_event.emit', {
      listenerCount: this.runtimeEventListeners.size,
      ...providerRuntimeEventSummary(event),
    })
    for (const listener of this.runtimeEventListeners) {
      await Promise.resolve(listener(event)).catch(noop)
    }
  }
}

function bindingForUpsert(binding: ProviderRuntimeBindingWithMetadata) {
  return {
    adapterKey: binding.adapterKey,
    providerDriverKind: binding.providerDriverKind,
    providerInstanceId: binding.providerInstanceId,
    providerSessionId: binding.providerSessionId,
    runtimeMode: binding.runtimeMode,
    threadId: binding.threadId,
  }
}

function isActiveBinding(binding: ProviderRuntimeBindingWithMetadata) {
  return binding.status === 'starting' || binding.status === 'ready' || binding.status === 'running'
}

async function activeProviderBinding(
  adapter: ReturnType<ProviderAdapterRegistry['getByInstance']>,
  binding: ProviderRuntimeBindingWithMetadata,
) {
  if (await adapter.hasSession({ threadId: binding.threadId })) return binding

  return null
}

function providerSessionStartInput(
  input: ProviderStartSessionInput | ProviderEnsureSessionInput,
  payload: Record<string, unknown>,
  reusableBinding?: ProviderRuntimeBindingWithMetadata | null,
): ProviderSessionStartInput {
  const cwd = payload.cwd
  if (typeof cwd !== 'string' || cwd.trim().length === 0) {
    throw createInternalError(`Provider session ${input.threadId} is missing a cwd.`)
  }

  const modelSelection = payload.modelSelection
  if (!isModelSelectionLike(modelSelection)) {
    throw createInternalError(`Provider session ${input.threadId} is missing a model selection.`)
  }

  return {
    cwd,
    interactionMode: interactionModeFromPayload(payload.interactionMode),
    modelSelection,
    providerInstanceId: input.providerInstanceId,
    resumeCursor: reusableBinding?.resumeCursor ?? startInputResumeCursor(input),
    runtimeMode: input.runtimeMode,
    threadId: input.threadId,
  }
}

function startInputResumeCursor(input: ProviderStartSessionInput | ProviderEnsureSessionInput) {
  if ('resumeCursor' in input) return input.resumeCursor ?? null

  return null
}

function interactionModeFromPayload(value: unknown): InteractionMode | undefined {
  if (value === 'default' || value === 'plan') return value

  return undefined
}

function providerBindingStatusFromSession(
  status: ProviderAdapterSession['status'],
  override: ProviderRuntimeBindingStatus | undefined,
): ProviderRuntimeBindingStatus {
  if (override) return override
  if (status === 'waiting') return 'waiting'
  if (status === 'running') return 'running'
  if (status === 'starting') return 'starting'
  if (status === 'error') return 'error'
  if (status === 'stopped') return 'stopped'

  return 'ready'
}

function bindingUpdateFromRuntimeEvent(event: ProviderRuntimeEvent) {
  if (event.type === 'session.set') return bindingUpdateFromSessionSet(event)
  const providerInstanceId = providerInstanceIdFromEvent(event)
  if (!providerInstanceId) return null

  const status = bindingStatusFromRuntimeEvent(event)
  if (!status) return null

  return {
    activeTurnId: activeTurnIdFromRuntimeEvent(event),
    lastError: lastErrorFromRuntimeEvent(event),
    providerInstanceId,
    providerSessionId: providerSessionIdFromEvent(event),
    providerThreadId: providerThreadIdFromRuntimeEvent(event),
    resumeCursor: resumeCursorFromRuntimeEvent(event),
    runtimeMode: runtimeModeFromEvent(event),
    status,
    threadId: event.threadId,
  }
}

function providerInstanceIdFromEvent(event: ProviderRuntimeEvent) {
  if (!('providerInstanceId' in event)) return null

  return event.providerInstanceId ?? null
}

function providerSessionIdFromEvent(event: ProviderRuntimeEvent) {
  if (!('providerSessionId' in event)) return null

  return event.providerSessionId ?? null
}

function runtimeModeFromEvent(event: ProviderRuntimeEvent) {
  if (!('runtimeMode' in event)) return DEFAULT_RUNTIME_MODE

  return event.runtimeMode ?? DEFAULT_RUNTIME_MODE
}

function bindingUpdateFromSessionSet(
  event: Extract<ProviderRuntimeEvent, { type: 'session.set' }>,
) {
  return {
    activeTurnId: event.turnId,
    lastError: event.lastError ?? null,
    providerInstanceId: event.providerInstanceId,
    providerSessionId: event.providerSessionId,
    providerThreadId: null,
    resumeCursor: undefined,
    runtimeMode: event.runtimeMode ?? DEFAULT_RUNTIME_MODE,
    status: bindingStatusFromSessionSet(event.status),
    threadId: event.threadId,
  }
}

function bindingStatusFromSessionSet(
  status: Extract<ProviderRuntimeEvent, { type: 'session.set' }>['status'],
): ProviderRuntimeBindingStatus {
  switch (status) {
    case 'starting':
    case 'running':
      return status
    case 'ready':
      return 'ready'
    case 'error':
      return 'error'
    case 'interrupted':
      return 'ready'
    case 'stopped':
      return 'stopped'
  }
}

function bindingStatusFromRuntimeEvent(
  event: Exclude<ProviderRuntimeEvent, { type: 'session.set' }>,
): ProviderRuntimeBindingStatus | null {
  switch (event.type) {
    case 'session.started':
    case 'thread.started':
      return 'ready'
    case 'session.state.changed':
      return bindingStatusFromSessionState(event.payload.state)
    case 'turn.started':
      return 'running'
    case 'turn.completed':
      return event.payload.state === 'failed' ? 'error' : 'ready'
    case 'turn.aborted':
      return 'ready'
    case 'runtime.error':
      return 'error'
    case 'session.exited':
      return 'stopped'
    default:
      return null
  }
}

function bindingStatusFromSessionState(
  state: Extract<ProviderRuntimeEvent, { type: 'session.state.changed' }>['payload']['state'],
): ProviderRuntimeBindingStatus {
  if (state === 'waiting') return 'waiting'

  return state
}

function activeTurnIdFromRuntimeEvent(event: ProviderRuntimeEvent) {
  if (event.type === 'turn.completed') return null
  if (event.type === 'turn.aborted') return null
  if (event.type === 'session.exited') return null

  return event.turnId ?? null
}

function lastErrorFromRuntimeEvent(event: ProviderRuntimeEvent) {
  if (event.type === 'runtime.error') return event.payload.message
  if (event.type === 'turn.completed' && event.payload.state === 'failed') {
    return event.payload.errorMessage ?? 'Turn failed'
  }
  if (event.type === 'session.state.changed' && event.payload.state === 'error') {
    return event.payload.reason ?? 'Provider session error'
  }

  return null
}

function providerThreadIdFromRuntimeEvent(event: ProviderRuntimeEvent) {
  if (event.type === 'thread.started') return event.payload.providerThreadId ?? null

  return null
}

function resumeCursorFromRuntimeEvent(event: ProviderRuntimeEvent) {
  if (event.type !== 'session.started') return undefined

  return event.payload.resume ?? undefined
}

function canReuseProviderBinding(
  binding: ProviderRuntimeBindingWithMetadata | null,
  input: ProviderEnsureSessionInput,
  adapter: ReturnType<ProviderAdapterRegistry['getByInstance']>,
) {
  if (!binding) return false
  if (!isActiveBinding(binding)) return false
  if (binding.adapterKey !== adapter.adapterKey) return false
  if (binding.providerDriverKind !== adapter.driverKind) return false
  if (binding.providerInstanceId !== input.providerInstanceId) return false
  if (binding.runtimeMode !== input.runtimeMode) return false

  const payload = runtimePayloadRecord(binding.runtimePayload)
  if (payload.cwd !== input.runtimePayload.cwd) return false
  if (payload.runtimeMode && payload.runtimeMode !== input.runtimeMode) return false

  return modelSelectionsEqual(payload.modelSelection, input.runtimePayload.modelSelection)
}

function runtimePayloadRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value

  return {}
}

function modelSelectionsEqual(left: unknown, right: ModelSelection | undefined) {
  if (!right) return false
  if (!isModelSelectionLike(left)) return false
  if (left.providerInstanceId !== right.providerInstanceId) return false
  if (left.model !== right.model) return false

  return jsonEqual(left.options ?? null, right.options ?? null)
}

function isModelSelectionLike(value: unknown): value is ModelSelection {
  if (!isRecord(value)) return false
  if (typeof value.providerInstanceId !== 'string') return false

  return typeof value.model === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null) return false
  if (typeof value !== 'object') return false

  return !Array.isArray(value)
}

function jsonEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function providerErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message

  return String(error)
}

function noop() {}

function elapsedMs(startedAt: number) {
  return Math.round((performance.now() - startedAt) * 100) / 100
}

async function settleAdapterRuntimeEvents() {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}
