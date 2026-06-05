import { memo } from 'react'

import { WorkspaceSearchControls } from '@/components/workspace/search/components/workspace-search-controls'
import { WorkspaceSearchResults } from '@/components/workspace/search/components/workspace-search-results'

export const WorkspaceSearchPane = memo(({ rootPath }: { rootPath: string }) => {
  return (
    <section className='grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]'>
      <WorkspaceSearchControls rootPath={rootPath} />
      <WorkspaceSearchResults rootPath={rootPath} />
    </section>
  )
})
