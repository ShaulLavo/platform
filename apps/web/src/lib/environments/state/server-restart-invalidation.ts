import type { QueryClient } from '@tanstack/react-query'

import { log } from '@/lib/client-logging'
import { selectServerConnection } from '@workspace/client-core/environments/state/store'
import { useEnvironmentsStore } from '@/lib/environments/state/store'

export function installServerRestartInvalidation(queryClient: QueryClient, origin: string) {
  let seenGeneration = selectServerConnection(useEnvironmentsStore.getState(), origin).generation

  return useEnvironmentsStore.subscribe((state) => {
    const connection = selectServerConnection(state, origin)
    if (connection.generation === seenGeneration) return

    const previous = seenGeneration
    seenGeneration = connection.generation
    if (previous === 0 || seenGeneration === 0) return

    log.info({
      action: 'environment.server_restart.invalidate',
      area: 'environments',
      environmentId: state.entries[origin]?.environmentId ?? null,
      generation: seenGeneration,
      origin,
    })
    void queryClient.invalidateQueries()
  })
}
