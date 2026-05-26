import type { LogDashboardFilters, LogEventDetailsById } from '@workspace/contracts'

import { useLogEvents } from './use-log-events'
import { useLogLive } from './use-log-live'
import { LogsEventList } from './logs-event-list'

type LogsEventListContainerProps = {
  active: boolean
  filters: LogDashboardFilters
  inspectedEventId: string | null
  onInspectEvent: (eventId: string | null) => void
}

const emptyDetailsById: LogEventDetailsById = Object.freeze({})

export function LogsEventListContainer({
  active,
  filters,
  inspectedEventId,
  onInspectEvent,
}: LogsEventListContainerProps) {
  const events = useLogEvents(filters, active)
  useLogLive(filters, active)

  return (
    <>
      {events.isError ? (
        <div className='bg-destructive/10 text-destructive border-b px-3 py-2 text-xs'>
          Could not read local logs.
        </div>
      ) : null}
      <LogsEventList
        detailsById={events.data?.detailsById ?? emptyDetailsById}
        events={events.data?.events ?? []}
        inspectedEventId={inspectedEventId}
        onInspectEvent={onInspectEvent}
      />
    </>
  )
}
