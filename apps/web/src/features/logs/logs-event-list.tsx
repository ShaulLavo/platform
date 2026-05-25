import { useVirtualizer } from '@tanstack/react-virtual'
import type { LogEventSummary } from '@workspace/contracts'
import { useRef } from 'react'

import { LogsEventRow } from './logs-event-row'

type LogsEventListProps = {
  events: readonly LogEventSummary[]
  selectedId: string | null
  onSelectEvent: (id: string) => void
}

export function LogsEventList({ events, selectedId, onSelectEvent }: LogsEventListProps) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is the logs row virtualization layer.
  const virtualizer = useVirtualizer({
    count: events.length,
    estimateSize: () => 54,
    getItemKey: (index) => events[index]?.id ?? index,
    getScrollElement: () => parentRef.current,
    overscan: 12,
  })

  if (events.length === 0) {
    return (
      <div className='text-muted-foreground flex min-h-0 flex-1 items-center justify-center px-6 text-center text-xs'>
        No logs match the current filters.
      </div>
    )
  }

  return (
    <div className='app-scrollbar-thin min-h-0 flex-1 overflow-auto' ref={parentRef}>
      <div className='relative w-full' style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const event = events[virtualRow.index]
          if (!event) return null

          return (
            <LogsEventRow
              event={event}
              height={virtualRow.size}
              key={event.id}
              selected={selectedId === event.id}
              start={virtualRow.start}
              onSelectEvent={onSelectEvent}
            />
          )
        })}
      </div>
    </div>
  )
}
