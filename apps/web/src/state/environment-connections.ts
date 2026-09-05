import {
  flushChatProjectionCache,
  hydrateEnvironmentChatCache,
  useChatProjectionStore,
} from '@/features/chat/state/chat-projection-store'
import { createWideEventScope } from '@/lib/wide-event-scope'
import { readSettingsMirror } from '@/features/settings/utils/boot-mirror'
import {
  readCachedEnvironmentBindings,
  recordEnvironmentCacheBinding,
} from '@/features/chat/state/chat-projection-cache'
import { createClientError } from '@workspace/client-core/errors'
import type {
  EnvironmentId,
  HealthDescriptor,
  MachineDefinition,
  Machines,
} from '@workspace/contracts'
import type { EnvironmentPhase } from '@workspace/client-core/environments/utils/connection'
import { createEnvironmentIdentityDriftError } from '@workspace/client-core/environments/utils/structured-errors'
import { canonicalServerOrigin } from '@workspace/client-core/transport/client'
import { createStore } from 'zustand/vanilla'
import { createChatTransport } from '@/features/chat/transport/create-chat-transport'
import type { ChatTransport } from '@/features/chat/transport/chat-transport'
import { registerChatTransport, transportFor } from '@/features/chat/state/active-transports'
import { subscribeChatShell } from '@/features/chat/state/shell-subscription'
import { primaryServerOrigin, replaceEnvironmentEndpoint, serverEndpoint } from '@/lib/client'
import { useEnvironmentsStore } from '@/lib/environments/state/store'
import { queryClientFor } from '@/lib/environments/state/query-clients'
import { environmentScopedStorage } from '@/lib/environments/state/scoped-storage'
import { readEnvironmentDescriptor } from '@/lib/environments/utils/descriptor'
import { getPlatformBridge, type PlatformMachineState } from '@/lib/platform/bridge'
import { createClientInvariantError } from '@/lib/structured-errors'
import { errorMessage } from '@/lib/error-message'
import { createEnvironmentRecovery } from '@/state/environment-recovery'
import { initializeEnvironmentPersistence } from '@/state/environment-persistence'
import { readConnectedMachines, writeConnectedMachines } from '@/state/connected-machines'

export type ConnectedMachine = {
  readonly name: string
  readonly config: MachineDefinition
  readonly phase: EnvironmentPhase
  readonly lastError: string | null
  readonly lastErrorAt: number | null
  readonly environmentId: EnvironmentId | null
  readonly origin: string | null
  readonly endpoint: string | null
}

type LiveConnection = {
  readonly origin: string
  readonly transport: ChatTransport
  readonly stop: () => void
}

export function createEnvironmentConnections({
  activateEnvironment,
  createTransport = createChatTransport,
}: {
  readonly activateEnvironment: (environmentId: EnvironmentId) => void
  readonly createTransport?: (origin: string) => ChatTransport
}) {
  const store = createStore<{ machines: readonly ConnectedMachine[] }>(() => ({ machines: [] }))
  const desired = new Set(readConnectedMachines())
  const cachedBindings = readCachedEnvironmentBindings(['local', ...desired])
  const connections = new Map<EnvironmentId, LiveConnection>()
  const owners = new Map<EnvironmentId, string>()
  const attempts = new Map<string, AbortController>()
  let recovery: ReturnType<typeof createEnvironmentRecovery> | null = null
  let unsubscribeBridge: (() => void) | null = null
  let started = false

  function machineFor(name: string) {
    const machine = store.getState().machines.find((entry) => entry.name === name)
    if (machine) return machine
    throw createClientInvariantError(`Machine ${name} is no longer configured.`)
  }
  function update(name: string, change: Partial<Omit<ConnectedMachine, 'name' | 'config'>>) {
    store.setState(({ machines }) => ({
      machines: machines.map((entry) => (entry.name === name ? { ...entry, ...change } : entry)),
    }))
  }
  function phase(name: string, next: EnvironmentPhase, error: string | null = null) {
    const machine = store.getState().machines.find((entry) => entry.name === name)
    if (!machine) return
    update(name, {
      phase: next,
      lastError: error,
      lastErrorAt: error ? Date.now() : machine.lastErrorAt,
    })
    if (machine.origin && !hasAnotherOwner(machine))
      useEnvironmentsStore.getState().setPhase(machine.origin, next, error)
  }
  function stopConnection(environmentId: EnvironmentId) {
    const connection = connections.get(environmentId)
    if (!connection) return
    connections.delete(environmentId)
    connection.stop()
  }
  function observePhase(
    environmentId: EnvironmentId,
    origin: string,
    next: EnvironmentPhase,
    error: string | null,
  ) {
    useEnvironmentsStore.getState().setPhase(origin, next, error)
    const actual = useEnvironmentsStore.getState().entries[origin]?.phase ?? next
    for (const machine of store.getState().machines) {
      if (machine.environmentId !== environmentId || !desired.has(machine.name)) continue
      if (
        attempts.has(machine.name) ||
        machine.phase === 'identity-drift' ||
        machine.phase === 'blocked'
      )
        continue
      update(machine.name, {
        phase: actual,
        lastError: error,
        lastErrorAt: error ? Date.now() : machine.lastErrorAt,
      })
      if (machine.config.kind !== 'ssh') continue
      if (actual === 'live') recovery?.forget(machine.name)
      if (actual === 'reconnecting' || actual === 'offline') recovery?.schedule(machine.name)
      if (actual === 'blocked' || actual === 'identity-drift')
        recovery?.schedule(machine.name, true)
    }
  }
  function retain(origin: string, descriptor: HealthDescriptor, replace = false) {
    const environmentId = descriptor.environmentId
    const owner = owners.get(environmentId) ?? origin
    useEnvironmentsStore.getState().recordDescriptor(owner, descriptor)
    owners.set(environmentId, owner)
    if (connections.has(environmentId) && !replace) return owner
    stopConnection(environmentId)
    replaceEnvironmentEndpoint(owner, origin)
    queryClientFor(owner).setQueryData(['environment-descriptor'], descriptor)
    initializeEnvironmentPersistence(environmentScopedStorage(environmentId))
    const transport = createTransport(owner)
    const unregister = registerChatTransport(transport)
    const stopShell = subscribeChatShell(transport, (state) =>
      observePhase(environmentId, owner, state.phase, state.error),
    )
    connections.set(environmentId, {
      origin: owner,
      transport,
      stop: () => {
        stopShell()
        unregister()
      },
    })
    return owner
  }
  function serverHasPrimaryIdentity(environmentId: EnvironmentId) {
    return (
      useEnvironmentsStore.getState().entries[primaryServerOrigin()]?.environmentId ===
      environmentId
    )
  }
  async function resolveMachine(machine: ConnectedMachine, signal: AbortSignal) {
    if (machine.config.kind === 'origin') {
      const origin = canonicalServerOrigin(machine.config.url)
      const descriptor = await readEnvironmentDescriptor(
        origin,
        AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      )
      return { origin, descriptor, localPort: null }
    }
    const bridge = getPlatformBridge()
    if (!bridge) throw createClientInvariantError('SSH machines require the desktop app.')
    const state = await bridge.connectMachine(machine.name)
    signal.throwIfAborted()
    if (state.phase !== 'live') throw sshConnectionError(state)
    return state
  }
  async function connectMachine(name: string): Promise<void> {
    if (!started || attempts.has(name)) return
    const machine = machineFor(name)
    desired.add(name)
    writeConnectedMachines(desired)
    restoreCachedConnections()
    if (machine.phase === 'live' && machine.environmentId && connections.has(machine.environmentId))
      return
    const abort = new AbortController()
    attempts.set(name, abort)
    phase(name, machine.config.kind === 'ssh' ? 'launching' : 'connecting')
    const event = createWideEventScope({
      action: 'environment.connect',
      area: 'environments',
      machine: name,
      environmentId: machine.environmentId,
    })
    try {
      const result = await resolveMachine(machine, abort.signal)
      abort.signal.throwIfAborted()
      if (machine.environmentId && machine.environmentId !== result.descriptor.environmentId)
        throw createEnvironmentIdentityDriftError(
          result.origin,
          machine.environmentId,
          result.descriptor.environmentId,
        )
      if (!serverHasPrimaryIdentity(result.descriptor.environmentId))
        useEnvironmentsStore.getState().describeMachine(result.origin, {
          name,
          kind: machine.config.kind,
          label: machine.config.label ?? name,
          localPort: result.localPort,
        })
      useEnvironmentsStore.getState().recordDescriptor(result.origin, result.descriptor)
      event.set({ environmentId: result.descriptor.environmentId, outcome: 'connected' })
      const replaceEndpoint =
        machine.origin !== null &&
        machine.endpoint === serverEndpoint(machine.origin) &&
        result.origin !== machine.endpoint &&
        !serverHasPrimaryIdentity(result.descriptor.environmentId)
      const origin = retain(result.origin, result.descriptor, replaceEndpoint)
      const currentPhase = useEnvironmentsStore.getState().entries[origin]?.phase ?? 'connecting'
      update(name, {
        origin,
        endpoint: result.origin,
        environmentId: result.descriptor.environmentId,
        phase: currentPhase,
        lastError: null,
      })
      recordEnvironmentCacheBinding(environmentScopedStorage(result.descriptor.environmentId), {
        names: [name],
        origin: result.origin,
        descriptor: result.descriptor,
      })
      recovery?.forget(name)
    } catch (error) {
      if (abort.signal.aborted) return
      const code = error && typeof error === 'object' && 'code' in error ? error.code : null
      const drift = code === 'ENVIRONMENT_IDENTITY_DRIFT'
      const blocked =
        drift ||
        code === 'ENVIRONMENT_PROTOCOL_MISMATCH' ||
        code === 'MACHINE_BLOCKED' ||
        (!getPlatformBridge() && machine.config.kind === 'ssh')
      let failurePhase: EnvironmentPhase = 'offline'
      if (blocked) failurePhase = 'blocked'
      if (drift) failurePhase = 'identity-drift'
      event.error(error)
      event.set({ outcome: failurePhase })
      phase(name, failurePhase, errorMessage(error, `Cannot connect to ${name}.`))
      recovery?.schedule(name, blocked)
    } finally {
      event.end({ cancelled: abort.signal.aborted })
      if (attempts.get(name) === abort) attempts.delete(name)
    }
  }
  function releaseConnection(machine: ConnectedMachine) {
    if (!machine.environmentId) return
    if (!hasAnotherOwner(machine)) {
      stopConnection(machine.environmentId)
      return
    }
    if (serverHasPrimaryIdentity(machine.environmentId) || !machine.origin) return
    if (serverEndpoint(machine.origin) !== machine.endpoint) return
    const replacement = store
      .getState()
      .machines.find(
        (other) =>
          other.name !== machine.name &&
          desired.has(other.name) &&
          other.environmentId === machine.environmentId &&
          other.endpoint !== null,
      )
    if (!replacement?.endpoint) return
    const descriptor = useEnvironmentsStore.getState().entries[replacement.endpoint]?.descriptor
    if (descriptor) retain(replacement.endpoint, descriptor, true)
  }

  async function replaceMachineConfiguration(machine: ConnectedMachine) {
    if (!started || !desired.has(machine.name)) return
    attempts.get(machine.name)?.abort()
    const abort = new AbortController()
    attempts.set(machine.name, abort)
    recovery?.forget(machine.name)
    phase(machine.name, 'reconnecting')
    releaseConnection(machine)
    try {
      if (machine.config.kind === 'ssh') await getPlatformBridge()?.disconnectMachine(machine.name)
      if (abort.signal.aborted || !started || !desired.has(machine.name)) return
      attempts.delete(machine.name)
      await connectMachine(machine.name)
    } catch (error) {
      if (abort.signal.aborted) return
      phase(machine.name, 'offline', errorMessage(error, `Cannot reconnect ${machine.name}.`))
      recovery?.schedule(machine.name)
    } finally {
      if (attempts.get(machine.name) === abort) attempts.delete(machine.name)
    }
  }

  async function disconnectMachine(name: string) {
    const machine = machineFor(name)
    desired.delete(name)
    writeConnectedMachines(desired)
    attempts.get(name)?.abort()
    attempts.delete(name)
    recovery?.forget(name)
    releaseConnection(machine)
    if (machine.origin && !hasAnotherOwner(machine))
      useEnvironmentsStore.getState().setPhase(machine.origin, 'offline')
    try {
      if (machine.config.kind === 'ssh') await getPlatformBridge()?.disconnectMachine(name)
    } catch (error) {
      phase(name, 'offline', errorMessage(error, `Could not stop ${name}.`))
      throw error
    }
    update(name, { phase: 'idle', lastError: null })
  }
  function hasAnotherOwner(machine: ConnectedMachine) {
    if (machine.environmentId && serverHasPrimaryIdentity(machine.environmentId)) return true
    return store
      .getState()
      .machines.some(
        (other) =>
          other.name !== machine.name &&
          desired.has(other.name) &&
          other.environmentId === machine.environmentId,
      )
  }
  function machineState(state: PlatformMachineState) {
    if (!desired.has(state.name)) return
    if (state.phase === 'live') return
    phase(state.name, state.phase, 'lastError' in state ? state.lastError : null)
    if (state.phase !== 'offline' && state.phase !== 'blocked' && state.phase !== 'identity-drift')
      return
    const machine = machineFor(state.name)
    if (machine.environmentId && !hasAnotherOwner(machine)) stopConnection(machine.environmentId)
    recovery?.schedule(state.name, state.phase !== 'offline')
  }
  function configureMachines(config: Machines) {
    reconcileMachines(config, 'settings')
  }
  function reconcileMachines(config: Machines, authority: 'mirror' | 'settings') {
    const previous = store.getState().machines
    const removed = previous.filter((entry) => !config[entry.name])
    const changed = previous.filter((entry) => {
      const definition = config[entry.name]
      return definition && !sameConnectionConfiguration(entry.config, definition)
    })
    const obsoleteNames =
      authority === 'settings' ? [...desired].filter((name) => !config[name]) : []
    for (const name of obsoleteNames) {
      desired.delete(name)
      attempts.get(name)?.abort()
      attempts.delete(name)
      recovery?.forget(name)
    }
    if (obsoleteNames.length > 0) writeConnectedMachines(desired)
    for (const machine of removed) void disconnectMachine(machine.name)
    store.setState({
      machines: Object.entries(config).map(([name, definition]) => {
        const existing = previous.find((entry) => entry.name === name)
        if (existing) return { ...existing, config: definition }
        const cached = cachedBindings.find((binding) => binding.names.includes(name))
        return {
          name,
          config: definition,
          phase: cached ? 'offline' : 'idle',
          lastError: null,
          lastErrorAt: null,
          environmentId: cached?.descriptor.environmentId ?? null,
          origin: cached?.origin ?? null,
          endpoint: cached?.origin ?? null,
        }
      }),
    })
    const removedIdentities = new Set([
      ...removed.flatMap((machine) => machine.environmentId ?? []),
      ...cachedBindings
        .filter((binding) => binding.names.some((name) => obsoleteNames.includes(name)))
        .map((binding) => binding.descriptor.environmentId),
    ])
    if (removedIdentities.size > 0) flushChatProjectionCache()
    for (const environmentId of removedIdentities) {
      if (serverHasPrimaryIdentity(environmentId)) continue
      if (store.getState().machines.some((machine) => machine.environmentId === environmentId))
        continue
      stopConnection(environmentId)
      useChatProjectionStore.getState().dropEnvironment(environmentId)
    }
    restoreCachedConnections()
    for (const machine of changed) void replaceMachineConfiguration(machine)
    for (const machine of store.getState().machines) updateMachineLabel(machine)
    if (!started) return
    for (const name of desired) {
      if (config[name]) void connectMachine(name)
    }
  }
  function updateMachineLabel(machine: ConnectedMachine) {
    if (
      !machine.origin ||
      !machine.environmentId ||
      serverHasPrimaryIdentity(machine.environmentId)
    )
      return
    const entry = useEnvironmentsStore.getState().entries[machine.origin]
    if (!entry || entry.name !== machine.name) return
    useEnvironmentsStore.getState().describeMachine(machine.origin, {
      name: machine.name,
      kind: machine.config.kind,
      label: machine.config.label ?? machine.name,
      localPort: entry.localPort,
    })
  }
  async function retryPrimary(): Promise<void> {
    if (!started || attempts.has('@primary')) return
    const origin = primaryServerOrigin()
    const abort = new AbortController()
    attempts.set('@primary', abort)
    useEnvironmentsStore.getState().setPhase(origin, 'connecting')
    try {
      const descriptor = await readEnvironmentDescriptor(
        origin,
        AbortSignal.any([abort.signal, AbortSignal.timeout(10_000)]),
      )
      abort.signal.throwIfAborted()
      retain(origin, descriptor, true)
      recordEnvironmentCacheBinding(environmentScopedStorage(descriptor.environmentId), {
        names: ['local'],
        origin,
        descriptor,
      })
      recovery?.forget('@primary')
    } catch (error) {
      if (abort.signal.aborted) return
      useEnvironmentsStore
        .getState()
        .setPhase(origin, 'offline', errorMessage(error, 'Cannot connect to the local machine.'))
      const phase = useEnvironmentsStore.getState().entries[origin]?.phase
      recovery?.schedule('@primary', phase === 'blocked' || phase === 'identity-drift')
    } finally {
      if (attempts.get('@primary') === abort) attempts.delete('@primary')
    }
  }
  function restoreCachedConnections() {
    for (const binding of cachedBindings) {
      const configuredNames = binding.names.filter(
        (name) =>
          desired.has(name) && store.getState().machines.some((machine) => machine.name === name),
      )
      const isPrimary = binding.names.includes('local') && binding.origin === primaryServerOrigin()
      if (!isPrimary && configuredNames.length === 0) continue
      const environmentId = binding.descriptor.environmentId
      const restored = useEnvironmentsStore
        .getState()
        .restoreDescriptor(binding.origin, binding.descriptor)
      if (!restored) continue
      const storage = environmentScopedStorage(environmentId)
      if (!owners.has(environmentId)) owners.set(environmentId, binding.origin)
      initializeEnvironmentPersistence(storage)
      hydrateEnvironmentChatCache(storage)
      const existing = transportFor(environmentId)
      if (existing) continue
      if (binding.origin !== primaryServerOrigin())
        useEnvironmentsStore.getState().describeMachine(binding.origin, {
          name: configuredNames[0] ?? 'local',
          kind: 'origin',
          label: binding.descriptor.label,
          localPort: null,
        })
      useEnvironmentsStore.getState().setPhase(binding.origin, 'offline')
      const transport = createTransport(binding.origin)
      transport.close()
      registerChatTransport(transport)
    }
  }
  reconcileMachines(readSettingsMirror()['environments.machines'], 'mirror')

  function start() {
    if (started) return
    started = true
    recovery = createEnvironmentRecovery((name) =>
      name === '@primary' ? retryPrimary() : connectMachine(name),
    )
    unsubscribeBridge = getPlatformBridge()?.onMachineState(machineState) ?? null
    const primary = useEnvironmentsStore.getState().entries[primaryServerOrigin()]
    if (primary?.descriptor && primary.phase !== 'offline') {
      retain(primary.origin, primary.descriptor)
      recordEnvironmentCacheBinding(environmentScopedStorage(primary.environmentId!), {
        names: ['local'],
        origin: primary.origin,
        descriptor: primary.descriptor,
      })
    }
    if (primary?.phase === 'offline') void retryPrimary()
    for (const machine of store.getState().machines) {
      if (desired.has(machine.name)) void connectMachine(machine.name)
    }
  }
  function stop() {
    started = false
    unsubscribeBridge?.()
    recovery?.dispose()
    recovery = null
    for (const attempt of attempts.values()) attempt.abort()
    attempts.clear()
    for (const environmentId of connections.keys()) stopConnection(environmentId)
  }
  return {
    store,
    start,
    stop,
    configureMachines,
    connectMachine,
    disconnectMachine,
    retryPrimary,
    retryMachine: async (name: string) => {
      const machine = machineFor(name)
      if (machine.environmentId && !hasAnotherOwner(machine)) stopConnection(machine.environmentId)
      phase(name, 'reconnecting')
      await connectMachine(name)
    },
    activateEnvironment,
    originFor: (environmentId: EnvironmentId) => owners.get(environmentId) ?? null,
  }
}
export type EnvironmentConnections = ReturnType<typeof createEnvironmentConnections>

function sameConnectionConfiguration(left: MachineDefinition, right: MachineDefinition) {
  if (left.kind === 'origin' && right.kind === 'origin') {
    return canonicalServerOrigin(left.url) === canonicalServerOrigin(right.url)
  }
  if (left.kind !== 'ssh' || right.kind !== 'ssh') return false
  return (
    left.target === right.target &&
    left.repoPath === right.repoPath &&
    left.remotePort === right.remotePort
  )
}

function sshConnectionError(state: Exclude<PlatformMachineState, { phase: 'live' }>) {
  let code = 'MACHINE_CONNECTION_FAILED'
  if (state.phase === 'blocked') code = 'MACHINE_BLOCKED'
  if (state.phase === 'identity-drift') code = 'ENVIRONMENT_IDENTITY_DRIFT'
  return createClientError({
    code,
    status: state.phase === 'blocked' ? 403 : 502,
    message: 'lastError' in state ? state.lastError : 'The SSH machine has not connected.',
    why: 'The desktop launcher refused or could not establish this machine connection.',
    fix: 'Resolve the machine error in Settings before reconnecting.',
  })
}
