import { cn } from '@workspace/ui/lib/utils'

import {
  PILL_NAV_BUTTON_BASE_CLASS,
  PILL_NAV_BUTTON_IDLE_CLASS,
  PILL_NAV_BUTTON_SELECTED_CLASS,
} from './navigation-styles'
import type { SidebarLocation } from './sidebar-locations'
import { useFilePickerSessionActions } from '@/components/file-picker/hooks/use-file-picker-session-actions'

export function LocationPill({
  currentPath,
  location,
}: {
  currentPath: string
  location: SidebarLocation
}) {
  const { jumpTo } = useFilePickerSessionActions()
  const selected = currentPath === location.path

  return (
    <button
      aria-current={selected ? 'page' : undefined}
      className={cn(
        PILL_NAV_BUTTON_BASE_CLASS,
        selected && PILL_NAV_BUTTON_SELECTED_CLASS,
        !selected && PILL_NAV_BUTTON_IDLE_CLASS,
      )}
      onClick={() => jumpTo(location.path)}
      type='button'
    >
      {location.label}
    </button>
  )
}
