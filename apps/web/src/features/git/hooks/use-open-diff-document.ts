import { useEditorCommands } from '@/features/editor/state/commands'
import { gitKeys } from '@/lib/query-keys'
import { useQueryClient } from '@tanstack/react-query'
import { fetchDiff } from '@/features/git/utils/api'
import { snapshotDiffDocumentId, hasDiffDocumentSnapshot } from '@/features/git/utils/diff-document'
import type { ChangeRow, FileDiff } from '@/features/git/utils/types'

export function useOpenDiffDocument() {
  const queryClient = useQueryClient()
  const { selectFile } = useEditorCommands()

  async function openDiff(row: ChangeRow) {
    const staged = row.section === 'staged'
    const diffs = await queryClient.fetchQuery({
      queryFn: ({ signal }) => fetchDiff(row.file.path, staged, signal),
      queryKey: gitKeys.diff(row.file.path, staged),
      staleTime: 1000,
    })
    const diff = firstMatchingDiff(diffs, row.file.path)
    if (!diff) return
    if (!hasDiffDocumentSnapshot(diff)) return

    // The status diff carries hunks but no file text, so it cannot answer "show
    // me the lines around this hunk". The viewer fetches the blob diff itself —
    // content-addressed by object id, so that fetch happens once per pair and
    // reopening the tab reuses the cache instead of refetching.
    selectFile(snapshotDiffDocumentId(diff))
  }

  async function openDiffs(rows: readonly ChangeRow[]) {
    for (const row of rows) {
      await openDiff(row)
    }
  }

  return { openDiff, openDiffs }
}

function firstMatchingDiff(diffs: readonly FileDiff[], path: string) {
  return diffs.find((diff) => diff.path === path || diff.oldPath === path)
}
