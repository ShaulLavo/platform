import type { FsEntry } from '@/lib/file-system-types'
import { cn } from '@workspace/ui/lib/utils'

import { useFilePickerSessionActions } from '@/components/file-picker/hooks/use-file-picker-session-actions'
import {
  PILL_NAV_BUTTON_BASE_CLASS,
  PILL_NAV_BUTTON_IDLE_CLASS,
  PILL_NAV_BUTTON_SELECTED_CLASS,
} from './navigation-styles'

export function RecentPill({ currentPath, entry }: { currentPath: string; entry: FsEntry }) {
  const { jumpTo } = useFilePickerSessionActions()
  const selected = currentPath === entry.path

  return (
    <button
      aria-current={selected ? 'page' : undefined}
      className={cn(
        PILL_NAV_BUTTON_BASE_CLASS,
        selected && PILL_NAV_BUTTON_SELECTED_CLASS,
        !selected && PILL_NAV_BUTTON_IDLE_CLASS,
      )}
      onClick={() => jumpTo(entry.path)}
      type='button'
    >
      {entry.name}
    </button>
  )
}
