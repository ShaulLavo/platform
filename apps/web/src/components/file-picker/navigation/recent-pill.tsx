import type { FsEntry } from '@/lib/file-system-types'
import { cn } from '@workspace/ui/lib/utils'

import {
  PILL_NAV_BUTTON_BASE_CLASS,
  PILL_NAV_BUTTON_IDLE_CLASS,
  PILL_NAV_BUTTON_SELECTED_CLASS,
} from './navigation-styles'

export function RecentPill({
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
        PILL_NAV_BUTTON_BASE_CLASS,
        selected && PILL_NAV_BUTTON_SELECTED_CLASS,
        !selected && PILL_NAV_BUTTON_IDLE_CLASS,
      )}
      onClick={() => onNavigate(entry.path)}
      type='button'
    >
      {entry.name}
    </button>
  )
}
