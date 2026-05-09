import { useEditorCommands } from "@/features/editor/state/editor-commands"
import { gitKeys } from "@/lib/query-keys"
import { useQueryClient } from "@tanstack/react-query"
import { fetchDiff } from "../api"
import { diffDocumentId } from "../diff-document"
import type { ChangeRow, FileDiff } from "../types"

export function useOpenDiffDocument() {
  const queryClient = useQueryClient()
  const { selectFile } = useEditorCommands()

  async function openDiff(row: ChangeRow) {
    const staged = row.section === "staged"
    const diffs = await queryClient.fetchQuery({
      queryFn: ({ signal }) => fetchDiff(row.file.path, staged, signal),
      queryKey: gitKeys.diff(row.file.path, staged),
      staleTime: 1000,
    })
    const diff = firstMatchingDiff(diffs, row.file.path)
    if (!diff) {
      selectFile(diffDocumentId(row.file.path, staged))
      return
    }

    const documentId = diffDocumentId(diff)
    queryClient.setQueryData(gitKeys.blobDiff(blobDiffQuery(diff)), [diff])
    selectFile(documentId)
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

function blobDiffQuery(diff: FileDiff) {
  return {
    newObjectId: diff.newObjectId,
    oldObjectId: diff.oldObjectId,
    oldPath: diff.oldPath,
    path: diff.path,
  }
}
