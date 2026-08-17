import { forwardRef, memo, useCallback, useRef } from 'react'
import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react'
import type { LogEventDetail, LogEventSummary } from '@workspace/contracts'
import { Accordion, AccordionContent, AccordionItem } from '@workspace/ui/components/accordion'

import {
  formatDuration,
  formatLogPrimary,
  formatLogSecondary,
  formatLogTime,
  logLevelClass,
  logLevelDotClass,
} from './log-formatters'
import {
  logRowPointerStart,
  shouldToggleLogRow,
  shouldToggleLogRowKey,
  type LogRowPointerStart,
} from './log-row-interactions'
import { LogsEventInlineDetail } from './logs-event-inline-detail'
import { LogsRowChevron } from './logs-row-chevron'
import { cn } from '@workspace/ui/lib/utils'

type LogsEventRowProps = {
  detail: LogEventDetail | null
  event: LogEventSummary
  expanded: boolean
  index: number
  start: number
  onInspectEvent: (eventId: string | null) => void
}

export const LogsEventRow = memo(
  forwardRef<HTMLDivElement, LogsEventRowProps>(function LogsEventRow(
    { detail, event, expanded, index, start, onInspectEvent },
    ref,
  ) {
    const pointerStartRef = useRef<LogRowPointerStart>(null)
    const value = expanded ? [event.id] : []
    const toggleRow = useCallback(() => {
      onInspectEvent(expanded ? null : event.id)
    }, [event.id, expanded, onInspectEvent])
    const handleRowPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
      pointerStartRef.current = logRowPointerStart(event)
    }, [])
    const handleRowClick = useCallback(
      (event: MouseEvent<HTMLDivElement>) => {
        if (!shouldToggleLogRow(event, pointerStartRef.current)) return

        toggleRow()
      },
      [toggleRow],
    )
    const handleRowKeyDown = useCallback(
      (event: KeyboardEvent<HTMLDivElement>) => {
        if (!shouldToggleLogRowKey(event.key)) return

        event.preventDefault()
        toggleRow()
      },
      [toggleRow],
    )

    return (
      <div
        className='absolute left-0 w-full border-b select-text'
        data-index={index}
        ref={ref}
        style={{ transform: `translateY(${start}px)` }}
      >
        <Accordion className='block' value={value}>
          <AccordionItem className='border-b-0' value={event.id}>
            <div
              className='hover:bg-row-hover grid min-h-[54px] w-full cursor-pointer grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-2 px-2 py-2 transition-colors'
              aria-expanded={expanded}
              aria-label={expanded ? 'Collapse log event' : 'Expand log event'}
              data-log-row-summary=''
              role='button'
              tabIndex={0}
              onClick={handleRowClick}
              onKeyDown={handleRowKeyDown}
              onPointerDown={handleRowPointerDown}
            >
              <span className='text-muted-foreground flex min-w-0 items-center gap-1.5 font-mono text-[10px] tabular-nums'>
                <span
                  className={cn('size-1.5 shrink-0 rounded-full', logLevelDotClass(event.level))}
                />
                {formatLogTime(event.timestamp)}
              </span>
              <span className='min-w-0'>
                <span className='block truncate text-[11px] font-medium'>
                  {formatLogPrimary(event)}
                </span>
                <span className='text-muted-foreground block truncate text-[10px]'>
                  {formatLogSecondary(event)}
                </span>
              </span>
              <div className='flex min-w-0 items-center gap-1.5'>
                {event.durationMs !== null ? (
                  <span className='text-muted-foreground font-mono text-[10px] tabular-nums'>
                    {formatDuration(event.durationMs)}
                  </span>
                ) : null}
                <span
                  className={cn(
                    'rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase leading-3',
                    logLevelClass(event.level),
                  )}
                >
                  {event.level}
                </span>
                <LogsRowChevron expanded={expanded} />
              </div>
            </div>
            <AccordionContent className='border-t px-2 py-2'>
              <LogsEventInlineDetail detail={detail} event={event} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    )
  }),
)
