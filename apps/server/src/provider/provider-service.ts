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
  ProviderRuntimeEvent,
  ProviderRuntimeSink,
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
  status?: 'starting' | 'running'
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
  status?: 'starting' | 'running'
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

  constructor(options: ProviderServiceOptions = {}) {
    this.adapterRegistry = options.adapterRegistry ?? createDefaultProviderAdapterRegistry()
    this.sessionDirectory = options.sessionDirectory ?? new ProviderSessionDirectory()
  }

  startSession(input: ProviderStartSessionInput) {
    recordChatPipelineInfo('chat.pipeline.provider_service.start_session.start', {
      providerInstanceId: input.providerInstanceId,
      runtimeMode: input.runtimeMode,
      status: input.status ?? 'starting',
      threadId: input.threadId,
    })
    const adapter = this.adapterRegistry.getByInstance(input.providerInstanceId)

    const binding = this.sessionDirectory.upsert({
      adapterKey: adapter.adapterKey,
      providerDriverKind: adapter.driverKind,
      providerInstanceId: input.providerInstanceId,
      providerSessionId: input.providerSessionId ?? providerSessionId(input.threadId),
      resumeCursor: input.resumeCursor,
      runtimeMode: input.runtimeMode,
      runtimePayload: input.runtimePayload,
      status: input.status ?? 'starting',
      threadId: input.threadId,
    })
    recordChatPipelineInfo('chat.pipeline.provider_service.start_session.complete', {
      ...providerBindingSummary(binding),
    })

    return binding
  }

  ensureSession(input: ProviderEnsureSessionInput): ProviderEnsureSessionResult {
    recordChatPipelineInfo('chat.pipeline.provider_service.ensure_session.start', {
      model: input.runtimePayload.modelSelection?.model,
      providerInstanceId: input.providerInstanceId,
      runtimeMode: input.runtimeMode,
      threadId: input.threadId,
    })
    const adapter = this.adapterRegistry.getByInstance(input.providerInstanceId)
    const existing = this.sessionDirectory.getBinding(input.threadId)
    const reused = canReuseProviderBinding(existing, input, adapter)
    const reusedBinding = reused ? existing : null
    const binding = this.sessionDirectory.upsert({
      adapterKey: adapter.adapterKey,
      providerDriverKind: adapter.driverKind,
      providerInstanceId: input.providerInstanceId,
      providerSessionId: reusedBinding?.providerSessionId ?? null,
      resumeCursor: reusedBinding?.resumeCursor ?? null,
      runtimeMode: input.runtimeMode,
      runtimePayload: input.runtimePayload,
      status: input.status ?? reusedBinding?.status ?? 'starting',
      threadId: input.threadId,
    })

    recordChatPipelineInfo('chat.pipeline.provider_service.ensure_session.complete', {
      ...providerBindingSummary(binding),
      reused,
    })

    return { binding, reused }
  }

  async sendTurn(input: ProviderTurnInput, sink: ProviderRuntimeSink) {
    const startedAt = performance.now()
    recordChatPipelineInfo(
      'chat.pipeline.provider_service.send_turn.start',
      providerTurnSummary(input),
    )
    const adapter = this.adapterRegistry.getByInstance(input.providerInstanceId)

    try {
      await adapter.startTurn(input, this.runtimeSink(sink))
      this.sessionDirectory.markRunningIfActive(input.thread.id)
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
      status: 'stopped',
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

  rollbackConversation(input: { numTurns: number; threadId: ThreadId }) {
    if (input.numTurns === 0) return Promise.resolve()

    return Promise.reject(new Error('Provider conversation rollback is not supported yet.'))
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

  private markTurnFailed(input: ProviderTurnInput, error: unknown) {
    const binding = this.sessionDirectory.getBinding(input.thread.id)
    if (!binding) return

    this.sessionDirectory.upsert({
      ...bindingForUpsert(binding),
      runtimePayload: { activeTurnId: null, lastError: providerErrorMessage(error) },
      status: 'error',
    })
  }

  private runtimeSink(sink: ProviderRuntimeSink): ProviderRuntimeSink {
    return {
      ingest: async (event) => {
        this.recordRuntimeEvent(event)
        await sink.ingest(event)
        await this.emitRuntimeEvent(event)
      },
    }
  }

  private recordRuntimeEvent(event: ProviderRuntimeEvent) {
    recordChatPipelineInfo('chat.pipeline.provider_service.runtime_event', {
      ...providerRuntimeEventSummary(event),
    })
    if (event.type !== 'session.set') return

    const adapter = this.adapterRegistry.adapter(event.providerInstanceId)
    if (!adapter) return

    this.sessionDirectory.upsert({
      adapterKey: adapter.adapterKey,
      providerDriverKind: adapter.driverKind,
      providerInstanceId: event.providerInstanceId,
      providerSessionId: event.providerSessionId,
      runtimeMode: event.runtimeMode ?? DEFAULT_RUNTIME_MODE,
      runtimePayload: {
        activeTurnId: event.turnId,
        lastError: event.lastError ?? null,
        lastRuntimeEvent: event.type,
      },
      status: providerRuntimeStatus(event.status),
      threadId: event.threadId,
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

export function createDefaultProviderService(options: ProviderServiceOptions = {}) {
  return new ProviderService(options)
}

function providerSessionId(threadId: ThreadId) {
  return `provider-session:${threadId}`
}

function providerRuntimeStatus(
  status: Extract<ProviderRuntimeEvent, { type: 'session.set' }>['status'],
) {
  switch (status) {
    case 'starting':
    case 'running':
      return status
    case 'ready':
      return 'running'
    case 'error':
      return 'error'
    case 'interrupted':
    case 'stopped':
      return 'stopped'
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
  return binding.status === 'starting' || binding.status === 'running'
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
