import { CircleNotchIcon } from '@phosphor-icons/react'

export function RecentShortcutLoading() {
  return (
    <div className='px-2 py-1'>
      <div className='text-muted-foreground/80 flex h-6 items-center gap-2 text-xs'>
        <CircleNotchIcon className='size-3.5 animate-spin' />
        Loading
      </div>
    </div>
  )
}
