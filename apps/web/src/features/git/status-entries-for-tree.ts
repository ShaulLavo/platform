import type { GitStatusEntry } from '@pierre/trees'

import { toTreePath } from '@/lib/path-formatters'
import type { FileStatus, TreeStatus } from './types'

export function statusEntriesForTree(
  files: readonly FileStatus[],
  rootPath: string,
): GitStatusEntry[] {
  const entries: GitStatusEntry[] = []

  for (const file of files) {
    const treePath = treePathForStatus(file.path, rootPath)
    const status = fileTreeStatus(file.status)
    if (!treePath || !status) continue

    entries.push({ path: treePath, status })
  }

  return entries
}

function treePathForStatus(path: string, rootPath: string) {
  if (path === rootPath) return ''
  if (!path.startsWith(`${rootPath}/`)) return null

  return toTreePath(path, rootPath)
}

function fileTreeStatus(status: TreeStatus | 'conflicted'): GitStatusEntry['status'] | null {
  if (status === 'conflicted') return 'modified'

  return status
}
