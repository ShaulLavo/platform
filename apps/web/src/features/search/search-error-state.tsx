import { WarningCircleIcon } from '@phosphor-icons/react'

import { cn } from '@workspace/ui/lib/utils'

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
