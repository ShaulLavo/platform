import { TreePane } from '@/components/workspace/file-tree/components/tree-pane'
import { useStatus } from '@/features/git/hooks'
import { statusEntriesForTree } from '@/features/git/utils/status-entries-for-tree'
import type { LoadState } from '@/lib/load-state'
import type { TreeModel } from '@/lib/tree-model'
import { memo, useMemo } from 'react'

export const FilesPane = memo(
  ({ rootPath, state }: { rootPath: string; state: LoadState<TreeModel> }) => {
    const gitStatus = useStatus(rootPath)
    const gitStatusEntries = useMemo(
      () => statusEntriesForTree(gitStatus.data?.files ?? [], rootPath),
      [gitStatus.data?.files, rootPath],
    )

    return <TreePane gitStatus={gitStatusEntries} rootPath={rootPath} state={state} />
  },
)
