import { Separator } from '@workspace/ui/components/separator'

import type { EntriesLoadState } from '../model'

import { LocationButton } from './location-button'
import { RecentSidebarSection } from './recent-sidebar-section'
import { sidebarLocationsFor } from './sidebar-locations'

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
    <aside className='bg-muted/25 hidden min-h-0 border-r p-2 lg:block'>
      <div className='text-muted-foreground mb-1 px-2 py-1 text-[11px] font-medium tracking-normal uppercase'>
        Locations
      </div>
      <div className='space-y-0.5'>
        {locations.map((location) => (
          <LocationButton currentPath={currentPath} key={location.id} location={location} />
        ))}
      </div>
      <Separator className='my-2' />
      <RecentSidebarSection currentPath={currentPath} state={recentState} />
    </aside>
  )
}
