import type { LogDashboardTimelineBucket } from '@workspace/contracts'

import { cn } from '@workspace/ui/lib/utils'

type LogsTimelineBarProps = {
  bucket: LogDashboardTimelineBucket
  maxTotal: number
}

export function LogsTimelineBar({ bucket, maxTotal }: LogsTimelineBarProps) {
  const height = `${Math.max(3, Math.round((bucket.total / maxTotal) * 100))}%`
  const tone = bucketTone(bucket)

  return (
    <div className='flex min-w-[3px] flex-1 items-end' title={timelineTitle(bucket)}>
      <div
        className={cn(
          'w-full border-t transition-colors',
          tone === 'error' && 'border-red-400 bg-red-500/45',
          tone === 'warn' && 'border-amber-400 bg-amber-500/45',
          tone === 'slow' && 'border-sky-400 bg-sky-500/45',
          tone === 'ok' && 'border-emerald-400/70 bg-emerald-500/30',
        )}
        style={{ height }}
      />
    </div>
  )
}

function bucketTone(bucket: LogDashboardTimelineBucket) {
  if (bucket.error > 0) return 'error'
  if (bucket.warn > 0) return 'warn'
  if (bucket.slow > 0) return 'slow'

  return 'ok'
}

function timelineTitle(bucket: LogDashboardTimelineBucket) {
  return `${bucket.total} events · ${bucket.error} errors · ${bucket.warn} warnings`
}
