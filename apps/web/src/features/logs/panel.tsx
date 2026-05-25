import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'

import { useWorkspaceFocus } from '@/components/workspace/workspace-focus-state'
import { logsKeys } from '@/lib/query-keys'
import {
  logDashboardFilters,
  defaultLogsFilterState,
  type LogsFilterState,
} from './log-filter-params'
import { logFilterQuery, logToolbarOptionFilters } from './log-filter-params'
import { useLogSummary } from './use-log-summary'
import { LogsDetail } from './logs-detail'
import { LogsEventListContainer } from './logs-event-list-container'
import { LogsTimeline } from './logs-timeline'
import { LogsToolbar } from './log-toolbar'

type LogsPanelProps = {
  active: boolean
}

export function LogsPanel({ active }: LogsPanelProps) {
  const queryClient = useQueryClient()
  const setFocusArea = useWorkspaceFocus((state) => state.setFocusArea)
  const [filtersState, setFiltersState] = useState<LogsFilterState>(defaultLogsFilterState)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now)
  const filters = useMemo(() => logDashboardFilters(filtersState, now), [filtersState, now])
  const queryFilters = useMemo(() => logFilterQuery(filters), [filters])
  const optionFilters = useMemo(() => logToolbarOptionFilters(filters), [filters])
  const optionQueryFilters = useMemo(() => logFilterQuery(optionFilters), [optionFilters])
  const summary = useLogSummary(filters, active)
  const optionSummary = useLogSummary(optionFilters, active)

  useEffect(() => {
    setSelectedEventId(null)
  }, [queryFilters])

  function handleRefresh() {
    setNow(Date.now())
    void queryClient.invalidateQueries({ queryKey: logsKeys.events(queryFilters) })
    void queryClient.invalidateQueries({ queryKey: logsKeys.summary(queryFilters) })
    void queryClient.invalidateQueries({ queryKey: logsKeys.summary(optionQueryFilters) })
  }

  return (
    <section
      className='bg-background text-foreground flex h-full min-h-0 flex-col'
      onFocusCapture={() => setFocusArea('logs')}
      onPointerDownCapture={() => setFocusArea('logs')}
    >
      <LogsToolbar
        areas={optionSummary.data?.areas ?? []}
        filters={filtersState}
        refreshing={summary.isFetching || optionSummary.isFetching}
        sources={optionSummary.data?.sources ?? []}
        onFiltersChange={setFiltersState}
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
        selectedEventId={selectedEventId}
        onSelectEvent={setSelectedEventId}
      />
      <LogsDetail active={active} eventId={selectedEventId} />
    </section>
  )
}
