import type { OrchestrationWsServerConfig } from '@workspace/contracts'
import { create } from 'zustand'

/**
 * What the client knows about the server on the other end of the RPC socket.
 *
 * `generation` is the load-bearing field: it counts server processes, not
 * reconnects. Every cache keyed on server-derived data — the provider list,
 * settings, git status — is stale the moment `serverInstanceId` changes, and
 * nothing else in the client can tell a restart from a dropped socket.
 */
type ServerConnectionState = {
  /** Bumped once per distinct server process this client has spoken to. */
  generation: number
  protocolVersion: number | null
  serverInstanceId: string | null
  /** Requests that have been in flight past the slow threshold, right now. */
  slowRequestCount: number
}

type ServerConnectionActions = {
  clearSlowRequest: (requestId: string) => void
  markSlowRequest: (requestId: string) => void
  reportConnected: (config: OrchestrationWsServerConfig) => void
}

export type ServerConnectionStore = ServerConnectionState & ServerConnectionActions

/**
 * Held outside the store because it is bookkeeping, not state: two overdue
 * requests settling must not drop the count below zero, and a request that
 * settles after the socket died must not decrement a fresh connection's count.
 */
const slowRequestIds = new Set<string>()

export const useServerConnectionStore = create<ServerConnectionStore>((set) => ({
  generation: 0,
  protocolVersion: null,
  serverInstanceId: null,
  slowRequestCount: 0,
  clearSlowRequest: (requestId) => {
    if (!slowRequestIds.delete(requestId)) return

    set({ slowRequestCount: slowRequestIds.size })
  },
  markSlowRequest: (requestId) => {
    if (slowRequestIds.has(requestId)) return

    slowRequestIds.add(requestId)
    set({ slowRequestCount: slowRequestIds.size })
  },
  // Same process reconnecting is not a new generation: the caches it fed are
  // still describing the truth, and invalidating them on every dropped socket
  // would refetch the world on a flaky network.
  reportConnected: (config) =>
    set((state) => {
      const base = {
        protocolVersion: config.protocolVersion,
        serverInstanceId: config.serverInstanceId,
      }
      if (state.serverInstanceId === config.serverInstanceId) return base

      return { ...base, generation: state.generation + 1 }
    }),
}))

/**
 * Whether the server is speaking a protocol this build cannot fully read. The
 * handshake carries the version precisely so the skew is detectable on connect
 * rather than later, on a frame that fails to parse.
 */
export function selectServerProtocolSkew(
  state: Pick<ServerConnectionStore, 'protocolVersion'>,
  expected: number,
) {
  if (state.protocolVersion === null) return false

  return state.protocolVersion !== expected
}

export function resetServerConnectionStore() {
  slowRequestIds.clear()
  useServerConnectionStore.setState({
    generation: 0,
    protocolVersion: null,
    serverInstanceId: null,
    slowRequestCount: 0,
  })
}
