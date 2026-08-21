import { describe, expect, it } from 'vitest'

import { compareSavedDocumentId } from '@/features/editor/utils/compare-saved-document'
import { conflictDiffDocumentId } from '@/features/editor/utils/conflict-diff-document'
import { fileBackedDocumentPath } from '@/features/editor/utils/file-backed-document'
import { fileBackedEditorPath } from '@/features/editor/utils/save'
import { snapshotDiffDocumentId } from '@/features/git/utils/diff-document'
import type { FileDiff } from '@/features/git/utils/types'
import { searchBufferDocumentId } from '@/features/search/utils/buffer-document'

describe('fileBackedDocumentPath', () => {
  it('returns ordinary filesystem paths', () => {
    expect(fileBackedDocumentPath('/repo/src/app.ts')).toBe('/repo/src/app.ts')
  })

  it('filters non-file editor document ids', () => {
    expect(fileBackedDocumentPath(snapshotDiffDocumentId(snapshotDiff('/repo/src/app.ts')))).toBe(
      null,
    )
    expect(fileBackedDocumentPath(conflictDiffDocumentId('conflict-1'))).toBe(null)
    expect(fileBackedDocumentPath(searchBufferDocumentId('/repo'))).toBe(null)
    expect(fileBackedDocumentPath(compareSavedDocumentId('/repo/src/app.ts'))).toBe(null)
  })
})

// A diff is drawn by real, editable-looking `Editor`s now. What keeps one from being saved is not
// the renderer but the document id, in both places that ask — `editability: 'readonly'` and
// `storeSync: 'none'` are the belt, and these are the braces.
describe('a diff document is not file-backed, whichever scheme it uses', () => {
  const gitDiff = snapshotDiffDocumentId(snapshotDiff('/repo/src/app.ts'))
  const compareSaved = compareSavedDocumentId('/repo/src/app.ts')

  it('is refused by the save path', () => {
    expect(fileBackedEditorPath(gitDiff)).toBe(null)
    expect(fileBackedEditorPath(compareSaved)).toBe(null)
  })

  it('is refused by the document layer', () => {
    expect(fileBackedDocumentPath(gitDiff)).toBe(null)
    expect(fileBackedDocumentPath(compareSaved)).toBe(null)
  })
})

function snapshotDiff(path: string): FileDiff & { newObjectId: string; oldObjectId: string } {
  return {
    hunks: [],
    newObjectId: 'b'.repeat(40),
    oldObjectId: 'a'.repeat(40),
    patch: '',
    path,
    staged: false,
  }
}
