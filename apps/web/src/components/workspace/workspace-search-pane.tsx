import { memo } from 'react'

import { WorkspaceSearchControls } from '@/components/workspace/workspace-search-controls'
import { WorkspaceSearchResults } from '@/components/workspace/workspace-search-results'

export const WorkspaceSearchPane = memo(function WorkspaceSearchPane({
  rootPath,
}: {
  rootPath: string
}) {
  return (
    <section className='grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]'>
      <WorkspaceSearchControls rootPath={rootPath} />
      <WorkspaceSearchResults rootPath={rootPath} />
    </section>
  )
})
