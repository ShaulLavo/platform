import { clientForQueryClient } from '@/lib/environments/state/query-clients'
import { useEditorCommands } from '@/features/editor/state/commands'
import { gitKeys } from '@/lib/query-keys'
import { useQueryClient } from '@tanstack/react-query'
import { fetchDiff } from '@/features/git/utils/api'
import { snapshotDiffDocumentId, hasDiffDocumentSnapshot } from '@/features/git/utils/diff-document'
import type { ChangeRow, FileDiff } from '@/features/git/utils/types'
import { useState } from 'react'

export function useOpenDiffDocument() {
  const queryClient = useQueryClient()
  const { selectFile } = useEditorCommands()
  const [openingCount, setOpeningCount] = useState(0)

  async function openDiff(row: ChangeRow) {
    setOpeningCount((count) => count + 1)
    try {
      const staged = row.section === 'staged'
      const diffs = await queryClient.fetchQuery({
        queryFn: ({ signal, client }) =>
          fetchDiff(row.file.path, staged, signal, clientForQueryClient(client)),
        queryKey: gitKeys.diff(row.file.path, staged),
        staleTime: 1000,
      })
      const diff = firstMatchingDiff(diffs, row.file.path)
      if (!diff) return
      if (!hasDiffDocumentSnapshot(diff)) return

      // The status diff has no file text. The content-addressed blob query fills the warm editor.
      selectFile(snapshotDiffDocumentId(diff))
    } finally {
      setOpeningCount((count) => count - 1)
    }
  }

  async function openDiffs(rows: readonly ChangeRow[]) {
    for (const row of rows) {
      await openDiff(row)
    }
  }

  return { opening: openingCount > 0, openDiff, openDiffs }
}

function firstMatchingDiff(diffs: readonly FileDiff[], path: string) {
  return diffs.find((diff) => diff.path === path || diff.oldPath === path)
}
