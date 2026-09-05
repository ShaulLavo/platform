import {
  ORCHESTRATION_WS_PROTOCOL_VERSION,
  type HealthDescriptor,
  type OrchestrationWsServerConfig,
} from '@workspace/contracts'
import { create } from 'zustand'

import { activeServerOrigin, canonicalServerOrigin, setActiveServerOrigin } from '@/lib/client'
import {
  connectionAfterHandshake,
  connectionAfterDescriptor,
  createEnvironmentEntry,
  initialServerConnection,
  type EnvironmentEntry,
  type ServerConnectionState,
} from '@/lib/environments/utils/connection'
import {
  createEnvironmentIdentityDriftError,
  createEnvironmentProtocolMismatchError,
} from '@/lib/environments/utils/structured-errors'

export type EnvironmentsState = {
  readonly activeOrigin: string
  readonly entries: Readonly<Record<string, EnvironmentEntry>>
  readonly connectionByOrigin: Readonly<Record<string, ServerConnectionState>>
}

type EnvironmentsActions = {
  activate(origin: string): void
  addDevEnvironment(origin: string): void
  recordHandshake(origin: string, config: OrchestrationWsServerConfig): void
  recordDescriptor(origin: string, descriptor: HealthDescriptor): void
  markSlowRequest(origin: string, requestId: string): void
  clearSlowRequest(origin: string, requestId: string): void
}

export type EnvironmentsStore = EnvironmentsState & EnvironmentsActions

const primaryOrigin = activeServerOrigin()
const slowRequestIdsByOrigin = new Map<string, Set<string>>()

export const useEnvironmentsStore = create<EnvironmentsStore>((set, get) => ({
  activeOrigin: primaryOrigin,
  entries: { [primaryOrigin]: createEnvironmentEntry(primaryOrigin, primaryOrigin) },
  connectionByOrigin: { [primaryOrigin]: initialServerConnection },
  activate(origin) {
    origin = canonicalServerOrigin(origin)
    setActiveServerOrigin(origin)
    const state = get()
    set({
      activeOrigin: origin,
      entries: state.entries[origin]
        ? state.entries
        : { ...state.entries, [origin]: createEnvironmentEntry(origin, primaryOrigin) },
      connectionByOrigin: state.connectionByOrigin[origin]
        ? state.connectionByOrigin
        : { ...state.connectionByOrigin, [origin]: initialServerConnection },
    })
  },
  addDevEnvironment(origin) {
    origin = canonicalServerOrigin(origin)
    const state = get()
    if (state.entries[origin]) return

    set({
      entries: { ...state.entries, [origin]: createEnvironmentEntry(origin, primaryOrigin) },
      connectionByOrigin: { ...state.connectionByOrigin, [origin]: initialServerConnection },
    })
  },
  recordHandshake(origin, config) {
    origin = canonicalServerOrigin(origin)
    assertEnvironmentIdentity(origin, config.environmentId)
    assertEnvironmentProtocol(origin, config.protocolVersion)
    const state = get()
    const entry = state.entries[origin] ?? createEnvironmentEntry(origin, primaryOrigin)
    const connection = selectServerConnection(state, origin)
    if (connection.serverInstanceId !== config.serverInstanceId)
      slowRequestIdsByOrigin.delete(origin)

    set({
      entries: { ...state.entries, [origin]: { ...entry, environmentId: config.environmentId } },
      connectionByOrigin: {
        ...state.connectionByOrigin,
        [origin]: connectionAfterHandshake(connection, config),
      },
    })
  },
  recordDescriptor(origin, descriptor) {
    origin = canonicalServerOrigin(origin)
    assertEnvironmentIdentity(origin, descriptor.environmentId)
    assertEnvironmentProtocol(origin, descriptor.protocolVersion)
    const state = get()
    const entry = state.entries[origin] ?? createEnvironmentEntry(origin, primaryOrigin)
    set({
      entries: {
        ...state.entries,
        [origin]: { ...entry, environmentId: descriptor.environmentId, label: descriptor.label },
      },
      connectionByOrigin: {
        ...state.connectionByOrigin,
        [origin]: connectionAfterDescriptor(selectServerConnection(state, origin)),
      },
    })
  },
  markSlowRequest(origin, requestId) {
    origin = canonicalServerOrigin(origin)
    const ids = slowRequestIdsByOrigin.get(origin) ?? new Set<string>()
    if (ids.has(requestId)) return

    ids.add(requestId)
    slowRequestIdsByOrigin.set(origin, ids)
    updateSlowRequestCount(origin, ids.size)
  },
  clearSlowRequest(origin, requestId) {
    origin = canonicalServerOrigin(origin)
    const ids = slowRequestIdsByOrigin.get(origin)
    if (!ids?.delete(requestId)) return

    updateSlowRequestCount(origin, ids.size)
    if (ids.size === 0) slowRequestIdsByOrigin.delete(origin)
  },
}))

export function selectServerConnection(
  state: EnvironmentsState,
  origin: string,
): ServerConnectionState {
  return state.connectionByOrigin[canonicalServerOrigin(origin)] ?? initialServerConnection
}

export function resetServerConnectionStore(origin?: string): void {
  const state = useEnvironmentsStore.getState()
  if (origin !== undefined) {
    origin = canonicalServerOrigin(origin)
    slowRequestIdsByOrigin.delete(origin)
    useEnvironmentsStore.setState({
      connectionByOrigin: { ...state.connectionByOrigin, [origin]: initialServerConnection },
    })
    return
  }

  slowRequestIdsByOrigin.clear()
  useEnvironmentsStore.setState({
    connectionByOrigin: Object.fromEntries(
      Object.keys(state.entries).map((entryOrigin) => [entryOrigin, initialServerConnection]),
    ),
  })
}

function assertEnvironmentIdentity(origin: string, received: string): void {
  const state = useEnvironmentsStore.getState()
  const expected = state.entries[origin]?.environmentId
  if (!expected || expected === received) return

  useEnvironmentsStore.setState({
    connectionByOrigin: {
      ...state.connectionByOrigin,
      [origin]: {
        ...selectServerConnection(state, origin),
        phase: 'identity-drift',
        expected,
        received,
      },
    },
  })
  throw createEnvironmentIdentityDriftError(origin, expected, received)
}

function assertEnvironmentProtocol(origin: string, received: number): void {
  const expected = ORCHESTRATION_WS_PROTOCOL_VERSION
  if (received === expected) return

  const state = useEnvironmentsStore.getState()
  useEnvironmentsStore.setState({
    connectionByOrigin: {
      ...state.connectionByOrigin,
      [origin]: {
        ...selectServerConnection(state, origin),
        phase: 'protocol-mismatch',
        expected,
        received,
      },
    },
  })
  throw createEnvironmentProtocolMismatchError(origin, expected, received)
}

function updateSlowRequestCount(origin: string, slowRequestCount: number): void {
  const state = useEnvironmentsStore.getState()
  useEnvironmentsStore.setState({
    connectionByOrigin: {
      ...state.connectionByOrigin,
      [origin]: { ...selectServerConnection(state, origin), slowRequestCount },
    },
  })
}
