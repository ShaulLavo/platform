import type { LoadState } from '@/lib/load-state'
import type { TreeModel } from '@/lib/tree-model'

type ToolPaneHeaderTab = 'files' | 'git' | 'logs' | 'search'

export function ToolPaneHeader({
  tab,
  treeState,
  visibleTreeItemCount,
}: {
  tab: ToolPaneHeaderTab
  treeState?: LoadState<TreeModel>
  visibleTreeItemCount?: number | null
}) {
  const title = panelTabTitle(tab)
  const detail = tab === 'files' ? treeHeaderDetail(treeState, visibleTreeItemCount ?? null) : null

  return (
    <div className='flex h-10 shrink-0 items-center gap-2 border-b px-3'>
      <div className='min-w-0'>
        <div className='truncate text-xs font-medium'>{title}</div>
        {detail && <div className='text-muted-foreground truncate text-[11px]'>{detail}</div>}
      </div>
    </div>
  )
}

function panelTabTitle(tab: ToolPaneHeaderTab) {
  if (tab === 'files') return 'Files'
  if (tab === 'git') return 'Source Control'
  if (tab === 'logs') return 'Logs'

  return 'Search'
}

function treeHeaderDetail(
  treeState: LoadState<TreeModel> | undefined,
  visibleTreeItemCount: number | null,
) {
  if (!treeState) return null
  if (treeState.status === 'loading') return 'Loading...'
  if (treeState.status === 'error') return 'Unable to load files'
  if (visibleTreeItemCount === null) return null

  return `${visibleTreeItemCount} items`
}
