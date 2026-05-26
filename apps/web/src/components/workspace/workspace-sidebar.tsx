import { WorkspaceFilesPane } from '@/components/workspace/workspace-files-pane'
import { WorkspaceSearchPane } from '@/components/workspace/workspace-search-pane'
import { ChatSidePanel } from '@/features/chat/components/chat-side-panel'
import { Panel as GitPanel } from '@/features/git/panel'
import { LogsPanel } from '@/features/logs/panel'
import type { TreeEntry } from '@/lib/file-system-types'
import type { LoadState } from '@/lib/load-state'
import type { DirectoryLoadOptions, TreeModel } from '@/lib/tree-model'
import type { WorkspacePanelTab } from '@/lib/workspace-cache'
import {
  workspacePanelTabTitle,
  workspaceTreeHeaderDetail,
} from '@/components/workspace/workspace-view-utils'
import { TabsContent } from '@workspace/ui/components/tabs'

const sidebarTabPanelClassName = 'min-h-0 min-w-0 overflow-hidden'

export function WorkspaceSidebar({
  onLoadDirectory,
  onPrefetchDirectory,
  onVisibleItemCountChange,
  rootPath,
  sidebarVisible,
  tab,
  treeState,
  visibleTreeItemCount,
}: {
  onLoadDirectory: (entry: TreeEntry, treePath: string, options?: DirectoryLoadOptions) => void
  onPrefetchDirectory: (entry: TreeEntry, treePath: string) => void
  onVisibleItemCountChange: (count: number) => void
  rootPath: string
  sidebarVisible: boolean
  tab: WorkspacePanelTab
  treeState: LoadState<TreeModel>
  visibleTreeItemCount: number | null
}) {
  const logsActive = tab === 'logs'

  return (
    <aside
      aria-hidden={!sidebarVisible}
      className='flex h-full min-h-0 min-w-0 flex-col overflow-hidden'
      inert={!sidebarVisible}
    >
      {tab !== 'chat' ? (
        <WorkspaceSidebarHeader
          tab={tab}
          treeState={treeState}
          visibleTreeItemCount={visibleTreeItemCount}
        />
      ) : null}
      <TabsContent
        className={sidebarTabPanelClassName}
        hidden={tab !== 'files'}
        inert={tab !== 'files'}
        keepMounted
        value='files'
      >
        <WorkspaceFilesPane
          key={rootPath}
          rootPath={rootPath}
          state={treeState}
          onVisibleItemCountChange={onVisibleItemCountChange}
          onLoadDirectory={onLoadDirectory}
          onPrefetchDirectory={onPrefetchDirectory}
        />
      </TabsContent>
      <TabsContent
        className={sidebarTabPanelClassName}
        hidden={tab !== 'search'}
        inert={tab !== 'search'}
        keepMounted
        value='search'
      >
        <WorkspaceSearchPane rootPath={rootPath} />
      </TabsContent>
      <TabsContent
        className={sidebarTabPanelClassName}
        hidden={tab !== 'git'}
        inert={tab !== 'git'}
        keepMounted
        value='git'
      >
        <GitPanel rootPath={rootPath} />
      </TabsContent>
      <TabsContent
        className={sidebarTabPanelClassName}
        hidden={tab !== 'logs'}
        inert={tab !== 'logs'}
        keepMounted
        value='logs'
      >
        <LogsPanel active={logsActive} />
      </TabsContent>
      <TabsContent
        className={sidebarTabPanelClassName}
        hidden={tab !== 'chat'}
        inert={tab !== 'chat'}
        keepMounted
        value='chat'
      >
        <ChatSidePanel rootPath={rootPath} />
      </TabsContent>
    </aside>
  )
}

function WorkspaceSidebarHeader({
  tab,
  treeState,
  visibleTreeItemCount,
}: {
  tab: WorkspacePanelTab
  treeState: LoadState<TreeModel>
  visibleTreeItemCount: number | null
}) {
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
}
