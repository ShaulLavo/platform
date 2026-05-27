import { memo } from 'react'

import { WorkspaceSearchControls } from '@/components/workspace/workspace-search-controls'
import { WorkspaceSearchResults } from '@/components/workspace/workspace-search-results'
import { WorkspaceSearchRuntime } from '@/components/workspace/workspace-search-runtime'

export const WorkspaceSearchPane = memo(function WorkspaceSearchPane({
  active,
  rootPath,
}: {
  active: boolean
  rootPath: string
}) {
  return (
    <section className='grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]'>
      <WorkspaceSearchRuntime active={active} rootPath={rootPath} />
      <WorkspaceSearchControls rootPath={rootPath} />
      <WorkspaceSearchResults rootPath={rootPath} />
    </section>
  )
})
