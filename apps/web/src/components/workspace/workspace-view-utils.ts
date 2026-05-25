import type { LoadState } from '@/lib/load-state'
import type { WorkspacePanelTab } from '@/lib/workspace-cache'
import type { TreeModel } from '@/lib/tree-model'
import type { PanelSize } from '@workspace/ui/components/resizable'

const COLLAPSED_PANEL_SIZE_PX = 1

export type VisibleTreeItemCountSnapshot = {
  count: number
  rootPath: string
}

type WorkspacePanelSelection = {
  sidebarVisible: boolean
  workspacePanelTab: WorkspacePanelTab
}

export function isCollapsedPanelSize(size: PanelSize) {
  return size.inPixels <= COLLAPSED_PANEL_SIZE_PX
}

export function isWorkspacePanelTab(value: string): value is WorkspacePanelTab {
  return (
    value === 'chat' ||
    value === 'files' ||
    value === 'git' ||
    value === 'logs' ||
    value === 'search'
  )
}

export function workspacePanelSelectionForTabActivation(
  current: WorkspacePanelSelection,
  tab: WorkspacePanelTab,
): WorkspacePanelSelection {
  if (current.sidebarVisible && current.workspacePanelTab === tab) {
    return { ...current, sidebarVisible: false }
  }

  return { sidebarVisible: true, workspacePanelTab: tab }
}

export function workspacePanelTabTitle(tab: WorkspacePanelTab) {
  if (tab === 'chat') return 'Chat'
  if (tab === 'files') return 'Files'
  if (tab === 'logs') return 'Logs'
  if (tab === 'search') return 'Search'

  return 'Git'
}

export function workspaceResizableStorageKey(rootPath: string, group: string) {
  return `workspace:${rootPath}:${group}`
}

export function workspaceTreeHeaderDetail(
  state: LoadState<TreeModel>,
  visibleTreeItemCount: number | null,
) {
  if (state.status === 'ready' && visibleTreeItemCount !== null) {
    return visibleTreeItemCountLabel(visibleTreeItemCount)
  }
  if (state.status === 'error') return 'Could not load'
  if (state.status === 'loading') return 'Loading'

  return null
}

function visibleTreeItemCountLabel(count: number) {
  const noun = count === 1 ? 'item' : 'items'

  return `${count.toLocaleString()} visible ${noun}`
}
