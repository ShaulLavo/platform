import { useVirtualizer } from '@tanstack/react-virtual'
import type { LogEventDetailsById, LogEventSummary } from '@workspace/contracts'
import { useRef } from 'react'

import { logRowCollapsedHeightPx } from '@/features/logs/utils/row-layout'
import { LogsEventRow } from '@/features/logs/components/event-row'

type LogsEventListProps = {
  detailsById: LogEventDetailsById
  events: readonly LogEventSummary[]
  inspectedEventId: string | null
  onInspectEvent: (eventId: string | null) => void
}

export function LogsEventList({
  detailsById,
  events,
  inspectedEventId,
  onInspectEvent,
}: LogsEventListProps) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is the logs row virtualization layer.
  const virtualizer = useVirtualizer({
    count: events.length,
    estimateSize: () => logRowCollapsedHeightPx,
    getItemKey: (index) => events[index]?.id ?? index,
    getScrollElement: () => parentRef.current,
    measureElement:
      typeof ResizeObserver === 'undefined'
        ? undefined
        : (element) => element.getBoundingClientRect().height,
    overscan: 12,
  })
  // Read once here rather than as `ref={virtualizer.measureElement}` inside the row
  // loop. The React Compiler reads a member expression in a `ref` position as accessing
  // a ref value during render and fails the lint gate on it. Safe to hoist: virtual-core
  // assigns `measureElement` as an instance arrow function in its constructor, so it
  // carries its own binding and does not need the receiver.
  const measureElement = virtualizer.measureElement

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
              detail={detailsById[event.id] ?? null}
              event={event}
              expanded={inspectedEventId === event.id}
              index={virtualRow.index}
              key={event.id}
              ref={measureElement}
              start={virtualRow.start}
              onInspectEvent={onInspectEvent}
            />
          )
        })}
      </div>
    </div>
  )
}
