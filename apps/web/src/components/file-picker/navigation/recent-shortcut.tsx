import type { FsEntry } from '@/lib/file-system-types'
import { cn } from '@workspace/ui/lib/utils'

import { EntryIcon } from '../entry-ui'

import {
  SIDEBAR_NAV_BUTTON_BASE_CLASS,
  SIDEBAR_NAV_BUTTON_IDLE_CLASS,
  SIDEBAR_NAV_BUTTON_SELECTED_CLASS,
} from './navigation-styles'

export function RecentShortcut({
  currentPath,
  entry,
  onNavigate,
}: {
  currentPath: string
  entry: FsEntry
  onNavigate: (path: string) => void
}) {
  const selected = currentPath === entry.path

  return (
    <button
      aria-current={selected ? 'page' : undefined}
      className={cn(
        SIDEBAR_NAV_BUTTON_BASE_CLASS,
        selected && SIDEBAR_NAV_BUTTON_SELECTED_CLASS,
        !selected && SIDEBAR_NAV_BUTTON_IDLE_CLASS,
      )}
      onClick={() => onNavigate(entry.path)}
      type='button'
    >
      <EntryIcon className='size-4' entry={entry} iconMode='default' selected={selected} />
      <span className='truncate'>{entry.name}</span>
    </button>
  )
}
