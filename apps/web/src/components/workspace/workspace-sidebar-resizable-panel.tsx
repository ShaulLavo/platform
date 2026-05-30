import { WorkspaceSidebar } from '@/components/workspace/workspace-sidebar'
import {
  isCollapsedPanelSize,
  type VisibleTreeItemCountSnapshot,
} from '@/components/workspace/workspace-view-utils'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import type { TreeEntry } from '@/lib/file-system-types'
import type { LoadState } from '@/lib/load-state'
import type { DirectoryLoadOptions, TreeModel } from '@/lib/tree-model'
import {
  ResizableHandle,
  ResizablePanel,
  type PanelImperativeHandle,
  type PanelSize,
} from '@workspace/ui/components/resizable'
import { memo, useEffect, useRef, useState } from 'react'

type WorkspaceSidebarResizablePanelProps = {
  rootPath: string
  treeReady: boolean
  treeState: LoadState<TreeModel>
  onLoadDirectory: (entry: TreeEntry, treePath: string, options?: DirectoryLoadOptions) => void
  onPrefetchDirectory: (entry: TreeEntry, treePath: string) => void
}

export const WorkspaceSidebarResizablePanel = memo(({
  onLoadDirectory,
  onPrefetchDirectory,
  rootPath,
  treeReady,
  treeState,
}: WorkspaceSidebarResizablePanelProps) => {
  const sidebarVisible = useEditorWorkspaceState((state) => state.sidebarVisible)
  const setSidebarVisible = useEditorWorkspaceState((state) => state.setSidebarVisible)
  const sidebarPanelRef = useRef<PanelImperativeHandle | null>(null)
  const [visibleTreeItemCount, setVisibleTreeItemCount] =
    useState<VisibleTreeItemCountSnapshot | null>(null)
  const currentVisibleTreeItemCount =
    treeReady && visibleTreeItemCount?.rootPath === rootPath ? visibleTreeItemCount.count : null

  useEffect(() => {
    const sidebarPanel = sidebarPanelRef.current
    if (!sidebarPanel) return

    if (sidebarVisible) {
      sidebarPanel.expand()
      return
    }

    sidebarPanel.collapse()
  }, [sidebarVisible])

  function handleVisibleTreeItemCountChange(count: number) {
    setVisibleTreeItemCount((current) => {
      if (current?.count === count && current.rootPath === rootPath) return current

      return { count, rootPath }
    })
  }

  function handleSidebarResize(
    size: PanelSize,
    _id: string | number | undefined,
    previousSize: PanelSize | undefined,
  ) {
    if (!previousSize) return

    const nextSidebarVisible = !isCollapsedPanelSize(size)
    if (nextSidebarVisible === sidebarVisible) return

    setSidebarVisible(nextSidebarVisible)
  }

  return (
    <>
      <ResizablePanel
        id='workspace-sidebar'
        className='min-h-0 min-w-0 overflow-hidden'
        collapsible
        collapsedSize='0px'
        defaultSize={sidebarVisible ? '320px' : '0px'}
        minSize='240px'
        maxSize='50%'
        groupResizeBehavior='preserve-pixel-size'
        panelRef={sidebarPanelRef}
        onResize={handleSidebarResize}
      >
        <WorkspaceSidebar
          rootPath={rootPath}
          treeState={treeState}
          visibleTreeItemCount={currentVisibleTreeItemCount}
          onVisibleItemCountChange={handleVisibleTreeItemCountChange}
          onLoadDirectory={onLoadDirectory}
          onPrefetchDirectory={onPrefetchDirectory}
        />
      </ResizablePanel>
      <ResizableHandle
        aria-label='Resize workspace sidebar'
        className={sidebarVisible ? undefined : '-mr-px'}
        withHandle
      />
    </>
  )
})
