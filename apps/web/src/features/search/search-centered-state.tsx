import type { ReactNode } from 'react'

import { cn } from '@workspace/ui/lib/utils'

export function SearchCenteredState({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex min-h-0 items-center justify-center p-4 text-xs text-muted-foreground',
        className,
      )}
    >
      <div className='flex flex-col items-center gap-2'>{children}</div>
    </div>
  )
}
