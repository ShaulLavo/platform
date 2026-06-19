import { cn } from '@workspace/ui/lib/utils'

import {
  SIDEBAR_NAV_BUTTON_BASE_CLASS,
  SIDEBAR_NAV_BUTTON_IDLE_CLASS,
  SIDEBAR_NAV_BUTTON_SELECTED_CLASS,
} from './navigation-styles'
import type { SidebarLocation } from './sidebar-locations'
import { useFilePickerSessionActions } from '@/components/file-picker/hooks/use-file-picker-session-actions'

export function LocationButton({
  currentPath,
  location,
}: {
  currentPath: string
  location: SidebarLocation
}) {
  const { jumpTo } = useFilePickerSessionActions()
  const selected = currentPath === location.path
  const Icon = selected && 'openIcon' in location ? location.openIcon : location.icon

  return (
    <button
      aria-current={selected ? 'page' : undefined}
      className={cn(
        SIDEBAR_NAV_BUTTON_BASE_CLASS,
        selected && SIDEBAR_NAV_BUTTON_SELECTED_CLASS,
        !selected && SIDEBAR_NAV_BUTTON_IDLE_CLASS,
      )}
      onClick={() => jumpTo(location.path)}
      type='button'
    >
      <Icon
        className={cn('size-4 shrink-0', selected ? 'text-info' : 'text-muted-foreground')}
        weight='duotone'
      />
      <span className='truncate'>{location.label}</span>
    </button>
  )
}
