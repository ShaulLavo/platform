import type { ComponentProps } from 'react'

import { cn } from '@workspace/ui/lib/utils'

function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot='skeleton'
      // bg-row-hover, not bg-muted: --muted is a SURFACE token carrying
      // --surface-opacity, so on a light pane it composites to ~2% contrast and
      // the bar is invisible. The row tint is an overlay with fixed alpha,
      // which is what a skeleton bar actually is.
      className={cn('animate-pulse rounded-none bg-row-hover', className)}
      {...props}
    />
  )
}

export { Skeleton }
