import {
  contextUsageTone,
  formatContextTokens,
  type ContextUsage,
} from '@/features/chat/lib/context-usage'
import { cn } from '@workspace/ui/lib/utils'

const RADIUS = 7
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function ContextUsageRing({ usage }: { readonly usage: ContextUsage }) {
  const percent = Math.round(usage.ratio * 100)

  return (
    <span
      aria-label={`Context ${percent}% full`}
      className={cn('flex shrink-0 items-center gap-1.5', toneClass(usage.ratio))}
      role='img'
      title={ringTitle(usage, percent)}
    >
      <svg
        aria-hidden
        className='size-4 shrink-0 -rotate-90'
        fill='none'
        viewBox='0 0 18 18'
        xmlns='http://www.w3.org/2000/svg'
      >
        <circle
          className='text-border'
          cx='9'
          cy='9'
          r={RADIUS}
          stroke='currentColor'
          strokeWidth='2'
        />
        <circle
          cx='9'
          cy='9'
          r={RADIUS}
          stroke='currentColor'
          strokeDasharray={`${CIRCUMFERENCE * usage.ratio} ${CIRCUMFERENCE}`}
          strokeLinecap='round'
          strokeWidth='2'
        />
      </svg>
      <span className='text-[11px] tabular-nums'>{percent}%</span>
    </span>
  )
}

function ringTitle(usage: ContextUsage, percent: number) {
  const lines = [
    `${formatContextTokens(usage.usedTokens)} of ${formatContextTokens(usage.maxTokens)} tokens (${percent}%)`,
  ]
  if (usage.totalProcessedTokens !== null) {
    lines.push(`${formatContextTokens(usage.totalProcessedTokens)} processed this session`)
  }
  if (usage.compactsAutomatically) {
    lines.push('This provider compacts the context on its own when it fills.')
  }

  return lines.join('\n')
}

function toneClass(ratio: number) {
  const tone = contextUsageTone(ratio)
  if (tone === 'destructive') return 'text-destructive'
  if (tone === 'warning') return 'text-warning'

  return 'text-muted-foreground'
}
