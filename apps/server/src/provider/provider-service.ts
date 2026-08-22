import { createInternalError } from '../observability/structured-errors'

import type {
  ModelSelection,
  OrchestrationSessionStatus,
  ProviderInstanceId,
  ProviderSnapshot,
  RuntimeMode,
  ThreadId,
} from '@workspace/contracts'
import { DEFAULT_RUNTIME_MODE } from '@workspace/contracts'
import { providerContinuationKey } from './driver'
import type { ProviderSessionStartPayload } from './session-payload'
import type {
  ProviderAdapterRegistry,
  ProviderInstanceRoutingInfo,
} from './provider-adapter-registry'
import { createDefaultProviderAdapterRegistry } from './provider-adapter-registry'
import {
  isActiveBinding,
  ProviderSessionDirectory,
  type ProviderRuntimeBindingWithMetadata,
} from './provider-session-directory'
import { ProviderSessionReaper } from './provider-session-reaper'
import { SerialWorker } from '../orchestration/serial-worker'
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
  ProviderSessionStartInput,
  ProviderTurnControlInput,
  ProviderTurnInput,
  ProviderUserInputResponseInput,
} from './types'

export type ProviderServiceOptions = {
  adapterRegistry?: ProviderAdapterRegistry
  /** Overridden in tests that need the deadline to be reachable within one. */
  idleSessionDeadlineMs?: number
  sessionDirectory?: ProviderSessionDirectory
}

export type ProviderStartSessionInput = {
  providerInstanceId: ProviderInstanceId
  providerSessionId?: string | null
  resumeCursor?: unknown | null
  runtimeMode: RuntimeMode
  runtimePayload: ProviderSessionStartPayload
  status?: OrchestrationSessionStatus
  threadId: ThreadId
}

export type ProviderEnsureSessionInput = {
  providerInstanceId: ProviderInstanceId
  runtimeMode: RuntimeMode
  runtimePayload: ProviderSessionStartPayload
  status?: OrchestrationSessionStatus
  threadId: ThreadId
}

export type ProviderEnsureSessionResult = {
  binding: ProviderRuntimeBindingWithMetadata
  reused: boolean
}

export type ProviderRuntimeEventListener = (event: ProviderRuntimeEvent) => Promise<void> | void

type ProviderRuntimeEventTask = {
  adapter: ReturnType<ProviderAdapterRegistry['getByInstance']>
  event: ProviderRuntimeEvent
  providerInstanceId: ProviderInstanceId
}

export class ProviderService {
  private readonly adapterSubscriptions = new Map<ProviderInstanceId, () => void>()
  private readonly adapterRegistry: ProviderAdapterRegistry
  private readonly reaper: ProviderSessionReaper
  private readonly runtimeEventListeners = new Set<ProviderRuntimeEventListener>()
  private readonly runtimeEvents = new SerialWorker<ProviderRuntimeEventTask>((task) =>
    this.handleRuntimeEvent(task),
  )
  private readonly sessionDirectory: ProviderSessionDirectory
  private shuttingDown = false
  private unsubscribeRegistry: (() => void) | null = null

  constructor(options: ProviderServiceOptions = {}) {
    this.adapterRegistry = options.adapterRegistry ?? createDefaultProviderAdapterRegistry()
    this.sessionDirectory = options.sessionDirectory ?? new ProviderSessionDirectory()
    this.reaper = new ProviderSessionReaper({
      deadlineMs: options.idleSessionDeadlineMs,
      directory: this.sessionDirectory,
      stopSession: (input) => this.stopSession(input),
    })
    this.startAdapterEventStreams()
  }

  /**
   * Liveness, called for every runtime event the ingestion pipeline accepts.
   * The reaper's deadline is only safe to act on because this is fed.
   */
  markSessionSeen(threadId: ThreadId) {
    this.sessionDirectory.markSeen(threadId)
  }

  /**
   * Releases the whole provider runtime: stops consuming adapter streams and
   * disposes every live instance, which is what kills the CLI children. Without
   * this the app exits and leaves `codex app-server` processes behind.
   */
  async shutdown() {
    this.shuttingDown = true
    this.unsubscribeRegistry?.()
    this.unsubscribeRegistry = null
    this.runtimeEventListeners.clear()
    for (const unsubscribe of this.adapterSubscriptions.values()) {
      unsubscribe()
    }
    this.adapterSubscriptions.clear()
    await this.adapterRegistry.dispose()
    recordChatPipelineInfo('chat.pipeline.provider_service.shutdown.complete', {})
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
      providerSessionStartInput(input, input.runtimePayload),
    )
    const binding = this.sessionDirectory.upsert({
      adapterKey: adapter.adapterKey,
      providerDriverKind: adapter.driverKind,
      providerInstanceId: input.providerInstanceId,
      providerSessionId: input.providerSessionId ?? session.providerSessionId,
      resumeCursor: session.resumeCursor ?? input.resumeCursor ?? null,
      runtimeMode: input.runtimeMode,
      runtimePayload: {
        ...input.runtimePayload,
        providerThreadId: session.providerThreadId ?? null,
      },
      status: input.status ?? session.status,
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
    // Reclaim before allocating, and never the thread being ensured: its own
    // binding can easily be the oldest one here.
    await this.reaper.sweep({ exceptThreadId: input.threadId })
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
    // A parameter change (model, runtime mode, cwd) restarts the session but
    // must not restart the *conversation*: the cursor of the account we are
    // still talking to travels into the new session.
    const continuation = continuableBinding(existing, adapter, input.providerInstanceId, {
      modelChanged: bindingModelChanged(existing, input.runtimePayload.modelSelection),
    })
    const session = await adapter.startSession(
      providerSessionStartInput(input, input.runtimePayload, continuation),
    )
    const binding = this.sessionDirectory.upsert({
      adapterKey: adapter.adapterKey,
      providerDriverKind: adapter.driverKind,
      providerInstanceId: input.providerInstanceId,
      providerSessionId: session.providerSessionId,
      resumeCursor: session.resumeCursor ?? continuation?.resumeCursor ?? null,
      runtimeMode: input.runtimeMode,
      runtimePayload: {
        ...input.runtimePayload,
        providerThreadId: session.providerThreadId ?? null,
      },
      status: input.status ?? session.status,
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
    // The adapter may have to (re)open a session for this turn — after a server
    // restart, or because the model changed. It can only continue the existing
    // conversation if the cursor rides along with the turn.
    const turn = this.turnWithResumeCursor(input, adapter)

    try {
      this.sessionDirectory.markStatus(input.thread.id, 'running')
      await adapter.sendTurn(turn)
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

  /** Every adapter event that has been published has been handed to the listeners. */
  drainRuntimeEvents() {
    return this.runtimeEvents.drain()
  }

  runtimeEventsIdle() {
    return this.runtimeEvents.isIdle()
  }

  bindingForThread(threadId: ThreadId) {
    return this.sessionDirectory.getBinding(threadId)
  }

  private turnWithResumeCursor(
    input: ProviderTurnInput,
    adapter: ReturnType<ProviderAdapterRegistry['getByInstance']>,
  ): ProviderTurnInput {
    if (input.resumeCursor !== undefined && input.resumeCursor !== null) return input

    const binding = this.sessionDirectory.getBinding(input.thread.id)
    const continuation = continuableBinding(binding, adapter, input.providerInstanceId)
    if (!continuation) return input

    return { ...input, resumeCursor: continuation.resumeCursor }
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
    this.unsubscribeRegistry = this.adapterRegistry.subscribeChanges((change) => {
      this.forgetRemovedStreams(change.providerInstanceIds)
      for (const providerInstanceId of change.providerInstanceIds) {
        this.startAdapterEventStream(providerInstanceId)
      }
    })
  }

  /**
   * A reconciled-away instance may come back under the same id with a different
   * account, and its replacement needs its own stream — so the id stops counting
   * as streamed the moment it leaves the registry.
   */
  private forgetRemovedStreams(liveProviderInstanceIds: readonly ProviderInstanceId[]) {
    const live = new Set(liveProviderInstanceIds)
    for (const [providerInstanceId, unsubscribe] of this.adapterSubscriptions) {
      if (live.has(providerInstanceId)) continue

      unsubscribe()
      this.adapterSubscriptions.delete(providerInstanceId)
    }
  }

  private startAdapterEventStream(providerInstanceId: ProviderInstanceId) {
    if (this.adapterSubscriptions.has(providerInstanceId)) return

    const adapter = this.adapterRegistry.adapter(providerInstanceId)
    if (!adapter) return

    this.adapterSubscriptions.set(
      providerInstanceId,
      adapter.subscribeEvents((event) => {
        void this.runtimeEvents.enqueue({ adapter, event, providerInstanceId }).catch((error) => {
          recordChatPipelineWarning('chat.pipeline.provider_service.runtime_stream.failed', {
            adapterKey: adapter.adapterKey,
            error,
            providerInstanceId,
          })
        })
      }),
    )
  }

  /**
   * Both conditions are checked on arrival rather than raced against a pending
   * read: an extra microtask between an adapter event and the binding write is
   * enough to let a later write (a session stop) be overwritten by an earlier
   * event.
   */
  private async handleRuntimeEvent(task: ProviderRuntimeEventTask) {
    if (this.shuttingDown) return
    if (!this.adapterSubscriptions.has(task.providerInstanceId)) return

    this.recordRuntimeEvent(task.event, task.adapter)
    await this.emitRuntimeEvent(task.event)
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

async function activeProviderBinding(
  adapter: ReturnType<ProviderAdapterRegistry['getByInstance']>,
  binding: ProviderRuntimeBindingWithMetadata,
) {
  if (await adapter.hasSession({ threadId: binding.threadId })) return binding

  return null
}

/**
 * The binding whose resume cursor the next session may adopt. A cursor is
 * minted by one account inside one driver, so it only travels within the same
 * continuation identity — repointing a thread at another provider or another
 * account correctly starts a fresh conversation.
 */
function continuableBinding(
  binding: ProviderRuntimeBindingWithMetadata | null,
  adapter: ReturnType<ProviderAdapterRegistry['getByInstance']>,
  providerInstanceId: ProviderInstanceId,
  options: { modelChanged: boolean } = { modelChanged: false },
) {
  if (!binding) return null
  if (binding.resumeCursor === null || binding.resumeCursor === undefined) return null

  const bindingKey = providerContinuationKey({
    driverKind: binding.providerDriverKind,
    providerInstanceId: binding.providerInstanceId,
  })
  const nextKey = providerContinuationKey({ driverKind: adapter.driverKind, providerInstanceId })
  if (bindingKey !== nextKey) return null
  // The one read site `sessionModelSwitch` ever needed: a driver that cannot
  // change model inside a conversation must not be handed a cursor that would
  // ask it to. Drivers that can keep the history.
  if (options.modelChanged && adapter.capabilities.sessionModelSwitch === 'unsupported') return null

  return binding
}

function bindingModelChanged(
  binding: ProviderRuntimeBindingWithMetadata | null,
  modelSelection: ModelSelection | undefined,
) {
  if (!binding) return false

  return !modelSelectionsEqual(binding.runtimePayload?.modelSelection, modelSelection)
}

function providerSessionStartInput(
  input: ProviderStartSessionInput | ProviderEnsureSessionInput,
  payload: ProviderSessionStartPayload,
  reusableBinding?: ProviderRuntimeBindingWithMetadata | null,
): ProviderSessionStartInput {
  return {
    cwd: payload.cwd,
    interactionMode: payload.interactionMode,
    modelSelection: payload.modelSelection,
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

/**
 * The one rule left between a session status and the binding row it writes:
 * `interrupted` describes the turn that just ended, and the process behind it
 * is idle and reclaimable — which is exactly what `ready` means to the reaper,
 * the only status it may touch. Everything else is copied through.
 */
function bindingStatusFromSessionSet(status: OrchestrationSessionStatus) {
  if (status === 'interrupted') return 'ready' as const

  return status
}

function bindingStatusFromRuntimeEvent(
  event: Exclude<ProviderRuntimeEvent, { type: 'session.set' }>,
): OrchestrationSessionStatus | null {
  switch (event.type) {
    case 'session.started':
    case 'thread.started':
      return 'ready'
    case 'session.state.changed':
      return event.payload.state
    case 'turn.started':
      return 'running'
    case 'turn.completed':
      return event.payload.state === 'failed' ? 'error' : 'ready'
    case 'runtime.error':
      return 'error'
    case 'session.exited':
      return 'stopped'
    default:
      return null
  }
}

function activeTurnIdFromRuntimeEvent(event: ProviderRuntimeEvent) {
  if (event.type === 'turn.completed') return null
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

  const payload = binding.runtimePayload
  if (payload?.cwd !== input.runtimePayload.cwd) return false
  if (payload?.runtimeMode && payload.runtimeMode !== input.runtimeMode) return false

  return modelSelectionsEqual(payload?.modelSelection, input.runtimePayload.modelSelection)
}

function modelSelectionsEqual(left: ModelSelection | undefined, right: ModelSelection | undefined) {
  if (!left) return false
  if (!right) return false
  if (left.providerInstanceId !== right.providerInstanceId) return false
  if (left.model !== right.model) return false

  return jsonEqual(left.options ?? null, right.options ?? null)
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
