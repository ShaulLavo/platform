import { useEffect } from 'react'
import type { LogDashboardFilters } from '@workspace/contracts'

import { useLogEvents } from './use-log-events'
import { useLogLive } from './use-log-live'
import { LogsEventList } from './logs-event-list'

type LogsEventListContainerProps = {
  active: boolean
  filters: LogDashboardFilters
  selectedEventId: string | null
  onSelectEvent: (id: string | null) => void
}

export function LogsEventListContainer({
  active,
  filters,
  selectedEventId,
  onSelectEvent,
}: LogsEventListContainerProps) {
  const events = useLogEvents(filters, active)
  useLogLive(filters, active)

  useEffect(() => {
    if (!active) return
    if (selectedEventId) return

    const firstEventId = events.data?.events[0]?.id
    if (!firstEventId) return

    onSelectEvent(firstEventId)
  }, [active, events.data?.events, onSelectEvent, selectedEventId])

  return (
    <>
      {events.isError ? (
        <div className='bg-destructive/10 text-destructive border-b px-3 py-2 text-xs'>
          Could not read local logs.
        </div>
      ) : null}
      <LogsEventList
        events={events.data?.events ?? []}
        selectedId={selectedEventId}
        onSelectEvent={onSelectEvent}
      />
    </>
  )
}
