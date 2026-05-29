import { cn } from '@workspace/ui/lib/utils'

import {
  PILL_NAV_BUTTON_BASE_CLASS,
  PILL_NAV_BUTTON_IDLE_CLASS,
  PILL_NAV_BUTTON_SELECTED_CLASS,
} from './navigation-styles'
import type { SidebarLocation } from './sidebar-locations'

export function LocationPill({
  currentPath,
  location,
  onNavigate,
}: {
  currentPath: string
  location: SidebarLocation
  onNavigate: (path: string) => void
}) {
  const selected = currentPath === location.path

  return (
    <button
      aria-current={selected ? 'page' : undefined}
      className={cn(
        PILL_NAV_BUTTON_BASE_CLASS,
        selected && PILL_NAV_BUTTON_SELECTED_CLASS,
        !selected && PILL_NAV_BUTTON_IDLE_CLASS,
      )}
      onClick={() => onNavigate(location.path)}
      type='button'
    >
      {location.label}
    </button>
  )
}
