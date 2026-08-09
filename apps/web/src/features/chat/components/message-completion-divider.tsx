import { CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react'

const PILL_CLASS =
  'border-border bg-background text-muted-foreground/80 rounded-full border px-2.5 py-1 text-[10px] tracking-[0.14em] uppercase tabular-nums'

/**
 * The rule that closes a turn. With `onToggle` it doubles as the turn's fold control —
 * same rule, same pill, so a folded turn and a finished one read as one boundary.
 */
export function MessageCompletionDivider({
  completionSummary,
  expanded = false,
  hiddenCount = 0,
  onToggle,
}: {
  completionSummary: string | null
  expanded?: boolean
  hiddenCount?: number
  onToggle?: () => void
}) {
  const label = dividerLabel({
    completionSummary,
    expanded,
    foldable: onToggle !== undefined,
    hiddenCount,
  })

  return (
    <div className='my-3 flex items-center gap-3'>
      <span className='bg-border h-px flex-1' />
      {onToggle ? (
        <button
          aria-expanded={expanded}
          className={`${PILL_CLASS} hover:text-foreground hover:border-border inline-flex items-center gap-1.5 transition-colors`}
          data-scroll-anchor-ignore
          type='button'
          onClick={onToggle}
        >
          {expanded ? (
            <CaretDownIcon aria-hidden='true' className='size-3' />
          ) : (
            <CaretRightIcon aria-hidden='true' className='size-3' />
          )}
          {label}
        </button>
      ) : (
        <span className={PILL_CLASS}>{label}</span>
      )}
      <span className='bg-border h-px flex-1' />
    </div>
  )
}

function dividerLabel({
  completionSummary,
  expanded,
  foldable,
  hiddenCount,
}: {
  completionSummary: string | null
  expanded: boolean
  foldable: boolean
  hiddenCount: number
}) {
  if (!foldable) return completionSummary ? `Response • ${completionSummary}` : 'Response'

  const summary = completionSummary ?? 'Worked'
  if (expanded) return `${summary} • Hide steps`

  return `${summary} • ${hiddenCount} ${hiddenCount === 1 ? 'step' : 'steps'}`
}
