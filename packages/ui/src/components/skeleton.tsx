import type { ComponentProps } from 'react'

import { cn } from '@workspace/ui/lib/utils'

function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot='skeleton'
      // skeleton-sweep, not bg-muted + animate-pulse: --muted is a SURFACE token
      // carrying --surface-opacity, so on a light pane it composites to ~2%
      // contrast and the bar is invisible. The utility paints the fixed-alpha
      // row tint and travels a highlight across it.
      className={cn('skeleton-sweep rounded-none', className)}
      {...props}
    />
  )
}

export { Skeleton }
