import type { ComponentProps } from 'react'

import { cn } from '@workspace/ui/lib/utils'

function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot='skeleton'
      className={cn('animate-pulse rounded-none bg-muted', className)}
      {...props}
    />
  )
}

export { Skeleton }
