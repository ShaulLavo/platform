import { LoadingState } from '@workspace/ui/components/loading-state'

import type { EntriesLoadState } from '@/features/file-picker/model'

import { RecentShortcut } from '@/features/file-picker/navigation/recent-shortcut'
import { RecentSidebarNote } from '@/features/file-picker/navigation/recent-sidebar-note'

export function RecentShortcutList({
  currentPath,
  state,
}: {
  currentPath: string
  state: EntriesLoadState
}) {
  if (state.status === 'loading') {
    return (
      <LoadingState
        className='compact:gap-1 compact:px-1.5 compact:py-1 gap-1.5 px-2 py-1.5'
        label='Loading recents'
        rows={2}
      />
    )
  }
  if (state.status === 'error') return <RecentSidebarNote>Could not load</RecentSidebarNote>
  if (state.status === 'ready' && state.data.length === 0) {
    return <RecentSidebarNote>No recent items</RecentSidebarNote>
  }

  const entries = state.status === 'ready' ? state.data : []

  return (
    <div className='space-y-0.5'>
      {entries.map((entry) => (
        <RecentShortcut currentPath={currentPath} entry={entry} key={entry.path} />
      ))}
    </div>
  )
}
