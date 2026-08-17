import type { TreeEntry } from '@/lib/file-system-types'
import { isFileEntry } from '@/lib/file-system-types'
import { entryForTreePath, type TreeModel } from '@/lib/tree-model'

export function selectedFileEntryForTreeSelection(
  model: TreeModel,
  selectedPaths: readonly string[],
): TreeEntry | null {
  for (const treePath of selectedPaths.toReversed()) {
    const entry = entryForTreePath(model, treePath)
    if (!entry || !isFileEntry(entry)) continue

    return entry
  }

  return null
}
