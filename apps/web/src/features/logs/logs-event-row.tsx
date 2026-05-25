import { memo } from 'react'
import type { LogEventSummary } from '@workspace/contracts'

import {
  formatDuration,
  formatLogPrimary,
  formatLogSecondary,
  formatLogTime,
  logLevelClass,
  logLevelDotClass,
} from './log-formatters'
import { cn } from '@workspace/ui/lib/utils'

type LogsEventRowProps = {
  event: LogEventSummary
  height: number
  selected: boolean
  start: number
  onSelectEvent: (id: string) => void
}

export const LogsEventRow = memo(function LogsEventRow({
  event,
  height,
  selected,
  start,
  onSelectEvent,
}: LogsEventRowProps) {
  return (
    <button
      aria-pressed={selected}
      className={cn(
        'absolute left-0 grid w-full grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-2 border-b px-2 py-2 text-left transition-colors hover:bg-muted/40',
        selected && 'bg-accent/70 hover:bg-accent/70',
      )}
      style={{ height, transform: `translateY(${start}px)` }}
      type='button'
      onClick={() => onSelectEvent(event.id)}
    >
      <span className='text-muted-foreground flex min-w-0 items-center gap-1.5 font-mono text-[10px] tabular-nums'>
        <span className={cn('size-1.5 shrink-0 rounded-full', logLevelDotClass(event.level))} />
        {formatLogTime(event.timestamp)}
      </span>
      <span className='min-w-0'>
        <span className='block truncate text-[11px] font-medium'>{formatLogPrimary(event)}</span>
        <span className='text-muted-foreground block truncate text-[10px]'>
          {formatLogSecondary(event)}
        </span>
      </span>
      <span className='flex min-w-0 items-center gap-1.5'>
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
      </span>
    </button>
  )
})
