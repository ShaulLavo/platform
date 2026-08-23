import { Separator } from '@workspace/ui/components/separator'

import type { EntriesLoadState } from '@/features/file-picker/model'

import { LocationButton } from '@/features/file-picker/navigation/location-button'
import { RecentSidebarSection } from '@/features/file-picker/navigation/recent-sidebar-section'
import { sidebarLocationsFor } from '@/features/file-picker/navigation/sidebar-locations'

export function PlacesSidebar({
  currentPath,
  homePath,
  recentState,
}: {
  currentPath: string
  homePath: string
  recentState: EntriesLoadState
}) {
  const locations = sidebarLocationsFor(homePath)

  return (
    <aside className='bg-muted/25 compact:p-1.5 hidden min-h-0 border-r p-2 lg:block'>
      <div className='text-muted-foreground compact:mb-0.5 compact:px-1.5 compact:py-0.5 mb-1 px-2 py-1 text-[11px] font-medium tracking-normal uppercase'>
        Locations
      </div>
      <div className='space-y-0.5'>
        {locations.map((location) => (
          <LocationButton currentPath={currentPath} key={location.id} location={location} />
        ))}
      </div>
      <Separator className='compact:my-1.5 my-2' />
      <RecentSidebarSection currentPath={currentPath} state={recentState} />
    </aside>
  )
}
