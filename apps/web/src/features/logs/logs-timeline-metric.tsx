import { cn } from '@workspace/ui/lib/utils'

type LogsTimelineMetricProps = {
  label: string
  tone?: 'error' | 'slow' | 'warn'
  value: number
}

export function LogsTimelineMetric({ label, tone, value }: LogsTimelineMetricProps) {
  return (
    <div className='border-border/70 bg-muted/20 min-w-0 border px-1.5 py-1'>
      <div
        className={cn(
          'truncate font-mono text-[13px] leading-4 text-foreground tabular-nums',
          tone === 'error' && 'text-red-500',
          tone === 'warn' && 'text-amber-500',
          tone === 'slow' && 'text-sky-500',
        )}
      >
        {value.toLocaleString()}
      </div>
      <div className='text-muted-foreground truncate'>{label}</div>
    </div>
  )
}
