import type { EntriesLoadState } from '@/features/file-picker/model'

import { RecentShortcut } from '@/features/file-picker/navigation/recent-shortcut'
import { RecentShortcutLoading } from '@/features/file-picker/navigation/recent-shortcut-loading'
import { RecentSidebarNote } from '@/features/file-picker/navigation/recent-sidebar-note'

export function RecentShortcutList({
  currentPath,
  state,
}: {
  currentPath: string
  state: EntriesLoadState
}) {
  if (state.status === 'loading') return <RecentShortcutLoading />
  if (state.status === 'error') return <RecentSidebarNote>Could not load</RecentSidebarNote>
  if (state.status === 'ready' && state.data.length === 0) {
    return <RecentSidebarNote>No folders yet</RecentSidebarNote>
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
