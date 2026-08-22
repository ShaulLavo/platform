import type { FileTreeModel } from '@workspace/tree'
import { useEffect } from 'react'

import { treeMutationLogContext } from '@/features/workspace/utils/tree-mutation-log'
import { log } from '@/lib/client-logging'

export function useFileTreeMutationEvents({
  rootPath,
  tree,
}: {
  readonly rootPath: string
  readonly tree: FileTreeModel
}) {
  useEffect(
    () =>
      tree.onMutation('*', (event) => {
        log.info({
          action: 'file-tree.mutation',
          area: 'file-tree',
          rootPath,
          ...treeMutationLogContext(event),
        })
      }),
    [rootPath, tree],
  )
}
