import { WarningCircleIcon } from '@phosphor-icons/react'

import { useLogEventDetail } from './use-log-event-detail'
import {
  formatDuration,
  formatLogDateTime,
  formatLogPrimary,
  logLevelClass,
} from './log-formatters'
import { cn } from '@workspace/ui/lib/utils'

type LogsDetailProps = {
  active: boolean
  eventId: string | null
}

export function LogsDetail({ active, eventId }: LogsDetailProps) {
  const detail = useLogEventDetail(eventId, active)

  if (!eventId) {
    return (
      <div className='bg-muted/10 text-muted-foreground border-t p-3 text-xs'>
        Select a log event to inspect its raw JSON.
      </div>
    )
  }
  if (detail.isError) {
    return (
      <div className='bg-muted/10 text-destructive flex items-center gap-2 border-t p-3 text-xs'>
        <WarningCircleIcon className='size-4 shrink-0' />
        Could not load log detail.
      </div>
    )
  }
  if (!detail.data) {
    return (
      <div className='bg-muted/10 text-muted-foreground border-t p-3 text-xs'>
        Loading log detail...
      </div>
    )
  }

  return (
    <div className='app-scrollbar-thin bg-muted/10 max-h-[42%] min-h-40 overflow-auto border-t'>
      <div className='border-b p-2'>
        <div className='flex min-w-0 items-center gap-2'>
          <span
            className={cn(
              'rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase leading-3',
              logLevelClass(detail.data.event.level),
            )}
          >
            {detail.data.event.level}
          </span>
          <span className='min-w-0 truncate text-xs font-medium'>
            {formatLogPrimary(detail.data.event)}
          </span>
        </div>
        <div className='text-muted-foreground mt-1 grid grid-cols-2 gap-1 text-[10px]'>
          <span className='truncate'>{formatLogDateTime(detail.data.event.timestamp)}</span>
          <span className='truncate text-right'>
            {formatDuration(detail.data.event.durationMs)}
          </span>
          <span className='truncate'>{detail.data.event.requestId ?? 'no request'}</span>
          <span className='truncate text-right'>{detail.data.event.threadId ?? 'no thread'}</span>
        </div>
      </div>
      <pre className='text-muted-foreground p-2 font-mono text-[10px] leading-4 break-words whitespace-pre-wrap'>
        {JSON.stringify(detail.data.rawJson, null, 2)}
      </pre>
    </div>
  )
}
