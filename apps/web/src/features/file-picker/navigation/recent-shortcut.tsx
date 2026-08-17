import type { FsEntry } from '@/lib/file-system-types'
import { cn } from '@workspace/ui/lib/utils'

import { EntryIcon } from '@/features/file-picker/entry-ui'
import { useFilePickerSessionActions } from '@/features/file-picker/hooks/use-file-picker-session-actions'

import {
  SIDEBAR_NAV_BUTTON_BASE_CLASS,
  SIDEBAR_NAV_BUTTON_IDLE_CLASS,
  SIDEBAR_NAV_BUTTON_SELECTED_CLASS,
} from '@/features/file-picker/navigation/navigation-styles'

export function RecentShortcut({ currentPath, entry }: { currentPath: string; entry: FsEntry }) {
  const { jumpTo } = useFilePickerSessionActions()
  const selected = currentPath === entry.path

  return (
    <button
      aria-current={selected ? 'page' : undefined}
      className={cn(
        SIDEBAR_NAV_BUTTON_BASE_CLASS,
        selected && SIDEBAR_NAV_BUTTON_SELECTED_CLASS,
        !selected && SIDEBAR_NAV_BUTTON_IDLE_CLASS,
      )}
      onClick={() => jumpTo(entry.path)}
      type='button'
    >
      <EntryIcon className='size-4' entry={entry} iconMode='default' selected={selected} />
      <span className='truncate'>{entry.name}</span>
    </button>
  )
}
