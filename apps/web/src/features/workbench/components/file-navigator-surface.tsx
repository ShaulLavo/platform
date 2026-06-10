import { FilesPane } from '@/components/workspace/file-tree/components/files-pane'

import { FileNavigatorHeader } from '@/features/workbench/components/file-navigator-header'
import { PanelUnavailable } from '@/features/workbench/components/panel-unavailable'
import type { SurfaceRendererProps } from '@/features/workbench/utils/surface-renderer-registry'
import { useEditorSurfaceContext } from '@/features/workbench/hooks/use-editor-surface-context'
import { createVisibleTreeItemCountStore } from '@/features/workbench/utils/visible-tree-item-count-store'
import { useWorkspaceTreeForRootPath } from '@/hooks/use-workspace-tree'
import { useCallback, useState } from 'react'

export function FileNavigatorSurface({ surface }: SurfaceRendererProps) {
  const { rootPath } = useEditorSurfaceContext()
  const { loadTreeDirectory, prefetchTreeDirectory, treeState } =
    useWorkspaceTreeForRootPath(rootPath)
  const [visibleTreeItemCountStore] = useState(() => createVisibleTreeItemCountStore())
  // Measured: visible-count publication should update the header, not repaint FilesPane.
  const handleVisibleTreeItemCountChange = useCallback(
    (count: number) => visibleTreeItemCountStore.setCount(rootPath, count),
    [rootPath, visibleTreeItemCountStore],
  )

  if (surface.type !== 'file-navigator') {
    return <PanelUnavailable message='This surface is not a file navigator.' />
  }

  return (
    <section className='bg-background flex h-full min-h-0 min-w-0 flex-col overflow-hidden'>
      <FileNavigatorHeader
        rootPath={rootPath}
        treeState={treeState}
        visibleTreeItemCountStore={visibleTreeItemCountStore}
      />
      <div className='min-h-0 min-w-0 flex-1 overflow-hidden'>
        <FilesPane
          key={rootPath}
          rootPath={rootPath}
          state={treeState}
          onVisibleItemCountChange={handleVisibleTreeItemCountChange}
          onLoadDirectory={loadTreeDirectory}
          onPrefetchDirectory={prefetchTreeDirectory}
        />
      </div>
    </section>
  )
}
