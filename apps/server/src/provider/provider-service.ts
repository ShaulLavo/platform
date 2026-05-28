import type {
  ProviderInstanceId,
  ProviderSnapshot,
  RuntimeMode,
  ThreadId,
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
    const adapter = this.adapterRegistry.getByInstance(input.providerInstanceId)

    return this.sessionDirectory.upsert({
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
  }

  async sendTurn(input: ProviderTurnInput, sink: ProviderRuntimeSink) {
    const adapter = this.adapterRegistry.getByInstance(input.providerInstanceId)

    try {
      await adapter.startTurn(input, this.runtimeSink(sink))
      this.sessionDirectory.markRunningIfActive(input.thread.id)
    } catch (error) {
      this.markTurnFailed(input, error)
      throw error
    }
  }

  async interruptTurn(input: ProviderTurnControlInput) {
    const routed = this.routeThread(input.threadId)
    if (!routed) return null

    await routed.adapter.interruptTurn(input)
    return this.sessionDirectory.upsert({
      ...bindingForUpsert(routed.binding),
      runtimePayload: { activeTurnId: null },
      status: 'stopped',
    })
  }

  async stopSession(input: { threadId: ThreadId }) {
    const routed = this.routeThread(input.threadId)
    if (!routed) return null

    await routed.adapter.stopSession(input)
    return this.sessionDirectory.upsert({
      ...bindingForUpsert(routed.binding),
      runtimePayload: { activeTurnId: null },
      status: 'stopped',
    })
  }

  async respondApproval(input: ProviderApprovalResponseInput) {
    const routed = this.routeThread(input.threadId)
    if (!routed) return false

    await routed.adapter.respondApproval(input)
    return true
  }

  async respondUserInput(input: ProviderUserInputResponseInput) {
    const routed = this.routeThread(input.threadId)
    if (!routed) return false

    await routed.adapter.respondUserInput(input)
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

function providerErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message

  return String(error)
}

function noop() {}
