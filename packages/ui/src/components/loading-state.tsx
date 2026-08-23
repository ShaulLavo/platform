import { Skeleton } from '@workspace/ui/components/skeleton'
import { useDelayedVisible } from '@workspace/ui/hooks/use-delayed-visible'
import { cn } from '@workspace/ui/lib/utils'

// Descending widths so the block reads as content rather than a progress bar.
const LOADING_ROW_WIDTHS = ['w-full', 'w-11/12', 'w-4/5', 'w-3/4', 'w-2/3', 'w-1/2'] as const

/**
 * The one answer to "this is still fetching" — every pane, list and pending
 * region renders through it. Deliberately NOT EmptyState: a sentence that says
 * "Loading X" is typographically identical to one that says "No X", so the user
 * cannot tell a slow panel from an empty one. Structure says "something is
 * coming" without claiming to know what.
 *
 * `label` is the accessible name only — nothing is drawn for it.
 *
 * The busy container mounts immediately so assistive tech is told right away;
 * only the bars wait out `delayMs`, which is what keeps a fast query from
 * flashing a skeleton.
 */
function LoadingState({
  className,
  delayMs = 120,
  label,
  rows = 3,
}: {
  className?: string
  delayMs?: number
  label: string
  rows?: number
}) {
  const visible = useDelayedVisible(delayMs)

  return (
    <div
      aria-busy='true'
      aria-label={label}
      className={cn(
        'flex min-h-0 flex-col',
        visible && 'gap-(--density-section-gap) p-(--density-loading-padding)',
        className,
      )}
      data-slot='loading-state'
      role='status'
    >
      {visible
        ? LOADING_ROW_WIDTHS.slice(0, Math.min(rows, LOADING_ROW_WIDTHS.length)).map((width) => (
            <Skeleton className={cn('h-4', width)} key={width} />
          ))
        : null}
    </div>
  )
}

export { LoadingState }
