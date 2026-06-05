import type { EntriesLoadState } from '../model'

import { RecentShortcut } from './recent-shortcut'
import { RecentShortcutLoading } from './recent-shortcut-loading'
import { RecentSidebarNote } from './recent-sidebar-note'

export function RecentShortcutList({
  currentPath,
  onNavigate,
  state,
}: {
  currentPath: string
  onNavigate: (path: string) => void
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
        <RecentShortcut
          currentPath={currentPath}
          entry={entry}
          key={entry.path}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  )
}
