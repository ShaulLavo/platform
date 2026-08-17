import { useQueryClient } from '@tanstack/react-query'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'

import { useFocus } from '@/components/workspace/focus/providers/focus-state'
import { logsKeys } from '@/lib/query-keys'
import { logDashboardFilters } from '@/features/logs/utils/filter-params'
import { logFilterQuery, logToolbarOptionFilters } from '@/features/logs/utils/filter-params'
import { useLogSummary } from '@/features/logs/hooks/use-summary'
import { LogsEventListContainer } from '@/features/logs/components/event-list-container'
import { LogsTimeline } from '@/features/logs/components/timeline'
import { LogsToolbar } from '@/features/logs/components/toolbar'
import { setLogsFilters, useLogsFilters } from '@/features/logs/state/filter-store'

type LogsPanelProps = {
  active: boolean
}

export const LogsPanel = memo(({ active }: LogsPanelProps) => {
  const queryClient = useQueryClient()
  const setFocusArea = useFocus((state) => state.setFocusArea)
  const filtersState = useLogsFilters()
  const [inspectedEventId, setInspectedEventId] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now)
  const filters = useMemo(() => logDashboardFilters(filtersState, now), [filtersState, now])
  const queryFilters = useMemo(() => logFilterQuery(filters), [filters])
  const optionFilters = useMemo(() => logToolbarOptionFilters(filters), [filters])
  const optionQueryFilters = useMemo(() => logFilterQuery(optionFilters), [optionFilters])
  const summary = useLogSummary(filters, active)
  const optionSummary = useLogSummary(optionFilters, active)

  useEffect(() => {
    setInspectedEventId(null)
  }, [queryFilters])

  function handleRefresh() {
    setNow(Date.now())
    void queryClient.invalidateQueries({ queryKey: logsKeys.events(queryFilters) })
    void queryClient.invalidateQueries({ queryKey: logsKeys.summary(queryFilters) })
    void queryClient.invalidateQueries({ queryKey: logsKeys.summary(optionQueryFilters) })
  }

  const handleInspectEvent = useCallback((eventId: string | null) => {
    setInspectedEventId(eventId)
  }, [])

  return (
    <section
      className='text-foreground flex h-full min-h-0 flex-col'
      onFocusCapture={() => setFocusArea('logs')}
      onPointerDownCapture={() => setFocusArea('logs')}
    >
      <LogsToolbar
        areas={optionSummary.data?.areas ?? []}
        filters={filtersState}
        refreshing={summary.isFetching || optionSummary.isFetching}
        sources={optionSummary.data?.sources ?? []}
        onFiltersChange={setLogsFilters}
        onRefresh={handleRefresh}
      />
      <LogsTimeline summary={summary.data} />
      {summary.isError ? (
        <div className='bg-destructive/10 text-destructive border-b px-3 py-2 text-xs'>
          Could not read local logs.
        </div>
      ) : null}
      <LogsEventListContainer
        active={active}
        filters={filters}
        inspectedEventId={inspectedEventId}
        onInspectEvent={handleInspectEvent}
      />
    </section>
  )
})
