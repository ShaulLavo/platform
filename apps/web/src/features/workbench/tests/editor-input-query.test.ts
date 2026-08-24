import { compareSavedDocumentId } from '@/features/editor/utils/compare-saved-document'
import { snapshotDiffDocumentId } from '@/features/git/utils/diff-document'
import type { SnapshotDiffDocumentInput } from '@/features/git/utils/diff-document'
import { blobDiffQueryKey } from '@/features/git/utils/blob-diff-query'
import { settingsDocumentId } from '@/features/settings/utils/document'
import { editorInputQueryKey } from '@/features/workbench/hooks/use-editor-input-pending'
import { fileSystemKeys } from '@/lib/query-keys'
import { gitFileDiff } from '../../../../test/factories/git-diff'
import { expect, test } from '../../../../test/fixtures'

test('maps editor inputs to the query that must resolve before they can draw', () => {
  const filePath = '/repo/src/app.ts'
  const diff = {
    ...gitFileDiff({ path: filePath }),
    newObjectId: 'new-object',
    oldObjectId: 'old-object',
  } satisfies SnapshotDiffDocumentInput

  expect(editorInputQueryKey(filePath)).toEqual(fileSystemKeys.fileSnapshot(filePath))
  expect(editorInputQueryKey(compareSavedDocumentId(filePath))).toEqual(
    fileSystemKeys.fileSnapshot(filePath),
  )
  expect(editorInputQueryKey(snapshotDiffDocumentId(diff))).toEqual(
    blobDiffQueryKey({
      newObjectId: diff.newObjectId,
      oldObjectId: diff.oldObjectId,
      oldPath: diff.oldPath,
      path: diff.path,
    }),
  )
  expect(editorInputQueryKey(settingsDocumentId())).toBeNull()
})
