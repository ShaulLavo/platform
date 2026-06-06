import { TreePane } from '@/components/workspace/file-tree/components/tree-pane'
import { useStatus } from '@/features/git/hooks'
import { statusEntriesForTree } from '@/features/git/status-entries-for-tree'
import type { TreeEntry } from '@/lib/file-system-types'
import type { LoadState } from '@/lib/load-state'
import type { DirectoryLoadOptions, TreeModel } from '@/lib/tree-model'
import { memo, useMemo } from 'react'

export const FilesPane = memo(
  ({
    onLoadDirectory,
    onPrefetchDirectory,
    onVisibleItemCountChange,
    rootPath,
    state,
  }: {
    onLoadDirectory: (entry: TreeEntry, treePath: string, options?: DirectoryLoadOptions) => void
    onPrefetchDirectory: (entry: TreeEntry, treePath: string) => void
    onVisibleItemCountChange: (count: number) => void
    rootPath: string
    state: LoadState<TreeModel>
  }) => {
    const gitStatus = useStatus(rootPath)
    const gitStatusEntries = useMemo(
      () => statusEntriesForTree(gitStatus.data?.files ?? [], rootPath),
      [gitStatus.data?.files, rootPath],
    )

    return (
      <TreePane
        gitStatus={gitStatusEntries}
        rootPath={rootPath}
        state={state}
        onVisibleItemCountChange={onVisibleItemCountChange}
        onLoadDirectory={onLoadDirectory}
        onPrefetchDirectory={onPrefetchDirectory}
      />
    )
  },
)
