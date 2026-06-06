import { useQueryClient } from '@tanstack/react-query'
import type { LogDashboardFilters, LogEventsResult, LogLiveStreamItem } from '@workspace/contracts'
import { useEffect, useMemo } from 'react'

import { logsKeys } from '@/lib/query-keys'
import { subscribeLogEvents } from './api'
import { createLiveEventBatcher } from './log-live-batcher'
import { logFilterQuery } from './log-filter-params'
import { mergeLiveLogItems } from './log-live-cache'

export function useLogLive(filters: LogDashboardFilters, enabled: boolean) {
  const queryClient = useQueryClient()
  const queryFilters = useMemo(() => logFilterQuery(filters), [filters])

  useEffect(() => {
    if (!enabled) return

    const controller = new AbortController()
    const batcher = createLiveEventBatcher<Extract<LogLiveStreamItem, { kind: 'event' }>>(
      (events) => {
        queryClient.setQueryData<LogEventsResult>(logsKeys.events(queryFilters), (current) =>
          mergeLiveLogItems(current, events),
        )
      },
    )

    void runLogLiveStream(filters, controller.signal, (item) => {
      if (item.kind !== 'event') return

      batcher.push(item)
    })

    return () => {
      controller.abort()
      batcher.cancel()
    }
  }, [enabled, filters, queryClient, queryFilters])
}

async function runLogLiveStream(
  filters: LogDashboardFilters,
  signal: AbortSignal,
  onItem: (item: LogLiveStreamItem) => void,
) {
  try {
    for await (const item of subscribeLogEvents(filters, signal)) {
      if (signal.aborted) return

      onItem(item)
    }
  } catch {
    // Live logging is opportunistic. History refresh still works if the stream drops.
  }
}
