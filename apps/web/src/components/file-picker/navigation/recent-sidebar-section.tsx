import { ClockCounterClockwiseIcon } from '@phosphor-icons/react'

import type { EntriesLoadState } from '../model'

import { RecentShortcutList } from './recent-shortcut-list'

export function RecentSidebarSection({
  currentPath,
  onNavigate,
  state,
}: {
  currentPath: string
  onNavigate: (path: string) => void
  state: EntriesLoadState
}) {
  return (
    <div>
      <div className='text-muted-foreground mb-1 flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium tracking-normal uppercase'>
        <ClockCounterClockwiseIcon className='size-3.5' />
        Recent
      </div>
      <RecentShortcutList currentPath={currentPath} onNavigate={onNavigate} state={state} />
    </div>
  )
}
