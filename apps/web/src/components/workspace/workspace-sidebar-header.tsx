import {
  workspacePanelTabTitle,
  workspaceTreeHeaderDetail,
} from '@/components/workspace/workspace-view-utils'
import type { LoadState } from '@/lib/load-state'
import type { TreeModel } from '@/lib/tree-model'
import type { WorkspacePanelTab } from '@/lib/workspace-cache'
import { memo } from 'react'

export const WorkspaceSidebarHeader = memo(({
  tab,
  treeState,
  visibleTreeItemCount,
}: {
  tab: WorkspacePanelTab
  treeState: LoadState<TreeModel>
  visibleTreeItemCount: number | null
}) => {
  const title = workspacePanelTabTitle(tab)
  const detail = tab === 'files' ? workspaceTreeHeaderDetail(treeState, visibleTreeItemCount) : null

  return (
    <div className='flex h-10 shrink-0 items-center gap-2 border-b px-3'>
      <div className='min-w-0'>
        <div className='truncate text-xs font-medium'>{title}</div>
        {detail && <div className='text-muted-foreground truncate text-[11px]'>{detail}</div>}
      </div>
    </div>
  )
})
