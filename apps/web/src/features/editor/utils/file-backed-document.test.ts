import { describe, expect, it } from 'bun:test'

import { conflictDiffDocumentId } from '@/features/editor/conflict-diff-document'
import { fileBackedDocumentPath } from '@/features/editor/utils/file-backed-document'
import { diffDocumentId } from '@/features/git/diff-document'
import { searchBufferDocumentId } from '@/features/search/search-buffer-document'

describe('fileBackedDocumentPath', () => {
  it('returns ordinary filesystem paths', () => {
    expect(fileBackedDocumentPath('/repo/src/app.ts')).toBe('/repo/src/app.ts')
  })

  it('filters non-file editor document ids', () => {
    expect(fileBackedDocumentPath(diffDocumentId('/repo/src/app.ts', false))).toBe(null)
    expect(fileBackedDocumentPath(conflictDiffDocumentId('conflict-1'))).toBe(null)
    expect(fileBackedDocumentPath(searchBufferDocumentId('/repo'))).toBe(null)
  })
})
