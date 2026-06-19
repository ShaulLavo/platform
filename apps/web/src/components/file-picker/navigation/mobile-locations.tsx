import type { EntriesLoadState } from '../model'

import { LocationPill } from './location-pill'
import { RecentPill } from './recent-pill'
import { sidebarLocationsFor } from './sidebar-locations'

export function MobileLocations({
  currentPath,
  homePath,
  recentState,
}: {
  currentPath: string
  homePath: string
  recentState: EntriesLoadState
}) {
  const locations = sidebarLocationsFor(homePath)
  const recents = recentState.status === 'ready' ? recentState.data : []

  return (
    <div className='mt-2 space-y-1 lg:hidden'>
      <div className='flex gap-1 overflow-x-auto pb-0.5'>
        {locations.map((location) => (
          <LocationPill currentPath={currentPath} key={location.id} location={location} />
        ))}
      </div>
      {recents.length > 0 && (
        <div className='flex items-center gap-1 overflow-x-auto pb-0.5'>
          <span className='text-muted-foreground shrink-0 px-1 text-[11px] font-medium uppercase'>
            Recent
          </span>
          {recents.map((entry) => (
            <RecentPill currentPath={currentPath} entry={entry} key={entry.path} />
          ))}
        </div>
      )}
    </div>
  )
}
