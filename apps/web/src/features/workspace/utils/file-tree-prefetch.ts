import type { TreeEntry } from '@/lib/file-system-types'
import { isFileEntry } from '@/lib/file-system-types'
import { canonicalTreePath } from '@/lib/path-formatters'
import { fileSystemKeys } from '@/lib/query-keys'

export const FILE_TREE_PREFETCH_MAX_BYTES = 1_048_576
export const FILE_TREE_PREFETCH_STALE_MS = 5_000

export function canPrefetchFileEntry(entry: TreeEntry) {
  return isFileEntry(entry) && entry.size <= FILE_TREE_PREFETCH_MAX_BYTES
}

export function treeDirectoryPrefetchKey(rootPath: string, treePath: string, entry: TreeEntry) {
  return fileSystemKeys.treeDirectory(rootPath, canonicalTreePath(treePath), entry.path)
}

export function fileTreeRowElements(root: ParentNode) {
  return Array.from(
    root.querySelectorAll<HTMLButtonElement>('button[data-type="item"][data-item-path]'),
  )
}

export function fileTreeRowPath(element: Element) {
  if (!(element instanceof HTMLElement)) return null

  const path = element.dataset.itemPath
  if (!path) return null

  return canonicalTreePath(path)
}
