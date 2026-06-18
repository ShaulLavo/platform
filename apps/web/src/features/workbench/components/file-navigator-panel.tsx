import { useCallback, useState } from 'react'

import { FilesPane } from '@/components/workspace/file-tree/components/files-pane'
import { FileNavigatorHeader } from '@/features/workbench/components/file-navigator-header'
import { createVisibleTreeItemCountStore } from '@/features/workbench/utils/visible-tree-item-count-store'
import { useWorkspaceTreeForRootPath } from '@/hooks/use-workspace-tree'

export function FileNavigatorPanel({ rootPath }: { readonly rootPath: string }) {
  const { loadTreeDirectory, prefetchTreeDirectory, treeState } =
    useWorkspaceTreeForRootPath(rootPath)
  const [visibleTreeItemCountStore] = useState(() => createVisibleTreeItemCountStore())
  // Measured: visible-count publication should update the header, not repaint FilesPane.
  const handleVisibleTreeItemCountChange = useCallback(
    (count: number) => visibleTreeItemCountStore.setCount(rootPath, count),
    [rootPath, visibleTreeItemCountStore],
  )

  return (
    <section className='flex h-full min-h-0 min-w-0 flex-col overflow-hidden'>
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
