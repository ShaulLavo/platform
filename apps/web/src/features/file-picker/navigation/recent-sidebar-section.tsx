import { ClockCounterClockwiseIcon } from '@phosphor-icons/react'

import type { EntriesLoadState } from '@/features/file-picker/model'

import { RecentShortcutList } from '@/features/file-picker/navigation/recent-shortcut-list'

export function RecentSidebarSection({
  currentPath,
  state,
}: {
  currentPath: string
  state: EntriesLoadState
}) {
  return (
    <div>
      <div className='text-muted-foreground compact:mb-0.5 compact:px-1.5 compact:py-0.5 mb-1 flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium tracking-normal uppercase'>
        <ClockCounterClockwiseIcon className='size-3.5' />
        Recent
      </div>
      <RecentShortcutList currentPath={currentPath} state={state} />
    </div>
  )
}
