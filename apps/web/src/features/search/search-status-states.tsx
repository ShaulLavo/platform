import { CircleNotchIcon, MagnifyingGlassIcon, WarningCircleIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

import type { SearchBufferStatus } from '@/features/search/search-buffer-state'
import { cn } from '@workspace/ui/lib/utils'

export function SearchPendingOrEmpty({
  className,
  status,
}: {
  className?: string
  status: SearchBufferStatus
}) {
  if (status === 'loading') {
    return (
      <SearchCenteredState className={className}>
        <CircleNotchIcon className='size-4 animate-spin' />
        Searching
      </SearchCenteredState>
    )
  }

  return (
    <SearchEmptyState
      className={className}
      description='Try a different query.'
      title='No matches'
    />
  )
}

export function SearchIdleState({ className }: { className?: string }) {
  return <div className={cn('min-h-0', className)} />
}

export function SearchEmptyState({
  className,
  description,
  title,
}: {
  className?: string
  description: string
  title: string
}) {
  return (
    <SearchCenteredState className={className}>
      <MagnifyingGlassIcon className='text-muted-foreground size-5' />
      <span className='text-foreground font-medium'>{title}</span>
      <span className='text-muted-foreground max-w-48 text-center text-[11px]'>{description}</span>
    </SearchCenteredState>
  )
}

export function SearchErrorState({
  className,
  message,
}: {
  className?: string
  message: string | null
}) {
  return (
    <div className={cn('flex min-h-0 items-center justify-center p-4', className)}>
      <div className='flex max-w-52 flex-col items-center gap-3 text-center text-xs'>
        <WarningCircleIcon className='text-destructive size-6' weight='duotone' />
        <div>
          <div className='font-medium'>Search failed</div>
          <p className='text-muted-foreground mt-1 text-[11px]'>{message ?? 'Search failed.'}</p>
        </div>
      </div>
    </div>
  )
}

function SearchCenteredState({ children, className }: { children: ReactNode; className?: string }) {
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
