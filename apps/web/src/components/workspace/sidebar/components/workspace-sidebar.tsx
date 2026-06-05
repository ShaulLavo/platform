import { WorkspaceFilesPane } from '@/components/workspace/file-tree/components/workspace-files-pane'
import { WorkspaceSearchPane } from '@/components/workspace/search/components/workspace-search-pane'
import { WorkspaceSidebarHeader } from '@/components/workspace/sidebar/components/workspace-sidebar-header'
import {
  workspaceActivityButtonId,
  workspaceSidebarPanelId,
} from '@/components/workspace/shell/utils/workspace-view-utils'
import { ChatSidePanel } from '@/features/chat/components/chat-side-panel'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import { Panel as GitPanel } from '@/features/git/panel'
import { LogsPanel } from '@/features/logs/panel'
import type { TreeEntry } from '@/lib/file-system-types'
import type { LoadState } from '@/lib/load-state'
import type { DirectoryLoadOptions, TreeModel } from '@/lib/tree-model'
import { memo } from 'react'

const sidebarTabPanelClassName = 'min-h-0 min-w-0 flex-1 overflow-hidden'

export const WorkspaceSidebar = memo(
  ({
    onLoadDirectory,
    onPrefetchDirectory,
    onVisibleItemCountChange,
    rootPath,
    treeState,
    visibleTreeItemCount,
  }: {
    onLoadDirectory: (entry: TreeEntry, treePath: string, options?: DirectoryLoadOptions) => void
    onPrefetchDirectory: (entry: TreeEntry, treePath: string) => void
    onVisibleItemCountChange: (count: number) => void
    rootPath: string
    treeState: LoadState<TreeModel>
    visibleTreeItemCount: number | null
  }) => {
    const activeTab = useEditorWorkspaceState((state) =>
      state.sidebarVisible ? state.workspacePanelTab : null,
    )
    const sidebarVisible = activeTab !== null
    const logsActive = activeTab === 'logs'

    return (
      <aside
        aria-hidden={!sidebarVisible}
        className='flex h-full min-h-0 min-w-0 flex-col overflow-hidden'
        inert={!sidebarVisible}
      >
        {activeTab && activeTab !== 'chat' ? (
          <WorkspaceSidebarHeader
            tab={activeTab}
            treeState={treeState}
            visibleTreeItemCount={visibleTreeItemCount}
          />
        ) : null}
        <div
          id={workspaceSidebarPanelId('files')}
          aria-labelledby={workspaceActivityButtonId('files')}
          className={sidebarTabPanelClassName}
          hidden={activeTab !== 'files'}
          inert={activeTab !== 'files'}
          role='tabpanel'
        >
          <WorkspaceFilesPane
            key={rootPath}
            rootPath={rootPath}
            state={treeState}
            onVisibleItemCountChange={onVisibleItemCountChange}
            onLoadDirectory={onLoadDirectory}
            onPrefetchDirectory={onPrefetchDirectory}
          />
        </div>
        <div
          id={workspaceSidebarPanelId('search')}
          aria-labelledby={workspaceActivityButtonId('search')}
          className={sidebarTabPanelClassName}
          hidden={activeTab !== 'search'}
          inert={activeTab !== 'search'}
          role='tabpanel'
        >
          <WorkspaceSearchPane rootPath={rootPath} />
        </div>
        <div
          id={workspaceSidebarPanelId('git')}
          aria-labelledby={workspaceActivityButtonId('git')}
          className={sidebarTabPanelClassName}
          hidden={activeTab !== 'git'}
          inert={activeTab !== 'git'}
          role='tabpanel'
        >
          <GitPanel rootPath={rootPath} />
        </div>
        <div
          id={workspaceSidebarPanelId('logs')}
          aria-labelledby={workspaceActivityButtonId('logs')}
          className={sidebarTabPanelClassName}
          hidden={activeTab !== 'logs'}
          inert={activeTab !== 'logs'}
          role='tabpanel'
        >
          <LogsPanel active={logsActive} />
        </div>
        <div
          id={workspaceSidebarPanelId('chat')}
          aria-labelledby={workspaceActivityButtonId('chat')}
          className={sidebarTabPanelClassName}
          hidden={activeTab !== 'chat'}
          inert={activeTab !== 'chat'}
          role='tabpanel'
        >
          <ChatSidePanel rootPath={rootPath} />
        </div>
      </aside>
    )
  },
)
