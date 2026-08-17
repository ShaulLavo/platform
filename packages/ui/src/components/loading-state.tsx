import { Skeleton } from '@workspace/ui/components/skeleton'
import { cn } from '@workspace/ui/lib/utils'

// Descending widths so the block reads as content rather than a progress bar.
const LOADING_ROW_WIDTHS = ['w-full', 'w-11/12', 'w-4/5', 'w-3/4', 'w-2/3', 'w-1/2'] as const

/**
 * What a panel shows while it is fetching. Deliberately NOT EmptyState: a
 * sentence that says "Loading X" is typographically identical to one that says
 * "No X", so the user cannot tell a slow panel from an empty one. Structure
 * says "something is coming" without claiming to know what.
 *
 * `label` is the accessible name only — nothing is drawn for it.
 */
function LoadingState({
  className,
  label,
  rows = 3,
}: {
  className?: string
  label: string
  rows?: number
}) {
  return (
    <div
      aria-busy='true'
      aria-label={label}
      className={cn('flex min-h-0 flex-col gap-2 p-3', className)}
      data-slot='loading-state'
      role='status'
    >
      {LOADING_ROW_WIDTHS.slice(0, Math.min(rows, LOADING_ROW_WIDTHS.length)).map((width) => (
        <Skeleton className={cn('h-4', width)} key={width} />
      ))}
    </div>
  )
}

export { LoadingState }
