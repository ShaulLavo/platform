import { describe, expect, it } from 'bun:test'

import { conflictDiffDocumentId } from '@/features/editor/conflict-diff-document'
import { fileBackedDocumentPath } from '@/features/editor/utils/file-backed-document'
import { snapshotDiffDocumentId } from '@/features/git/diff-document'
import type { FileDiff } from '@/features/git/types'
import { searchBufferDocumentId } from '@/features/search/search-buffer-document'

describe('fileBackedDocumentPath', () => {
  it('returns ordinary filesystem paths', () => {
    expect(fileBackedDocumentPath('/repo/src/app.ts')).toBe('/repo/src/app.ts')
  })

  it('filters non-file editor document ids', () => {
    expect(fileBackedDocumentPath(snapshotDiffDocumentId(snapshotDiff('/repo/src/app.ts')))).toBe(null)
    expect(fileBackedDocumentPath(conflictDiffDocumentId('conflict-1'))).toBe(null)
    expect(fileBackedDocumentPath(searchBufferDocumentId('/repo'))).toBe(null)
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
