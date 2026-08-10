import type { QueryClient } from '@tanstack/react-query'

import { log } from '@/lib/client-logging'

import { useServerConnectionStore } from './server-connection-store'

/**
 * Refetches server-derived caches when the process on the other end of the
 * socket changes.
 *
 * Before this, nothing observed the connection at all: a dev-server restart
 * left `providerListQueryOptions` — and every other TanStack Query cache —
 * serving pre-restart answers indefinitely, and only an explicit sign-in
 * invalidated anything.
 *
 * A subscription installed at the composition root rather than a hook, because
 * the concern outlives any component: the socket reconnects while no chat
 * surface is mounted, and a hook would also make stream supervision depend on a
 * React Query context it has no other use for.
 */
export function installServerRestartInvalidation(queryClient: QueryClient) {
  // The first handshake of a session is a connection, not a restart: there is
  // nothing cached from a previous server to throw away.
  let seenGeneration: number | null = null

  return useServerConnectionStore.subscribe((state) => {
    if (state.generation === 0) return
    if (state.generation === seenGeneration) return

    const previous = seenGeneration
    seenGeneration = state.generation
    if (previous === null) return

    log.info({
      action: 'chat.server_restart.invalidate',
      area: 'chat',
      generation: state.generation,
    })
    void queryClient.invalidateQueries()
  })
}
