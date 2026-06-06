import { describe, expect, it } from 'vitest'

import {
  conflictDiffDocumentId,
  conflictDiffDocumentLabel,
  conflictDiffDocumentTitle,
  parseConflictDiffDocumentId,
} from '../conflict-diff-document'

describe('conflict diff document ids', () => {
  it('round-trips conflict ids without embedding file text', () => {
    const id = conflictDiffDocumentId('conflict/1:changed')

    expect(parseConflictDiffDocumentId(id)).toEqual({
      conflictId: 'conflict/1:changed',
      id,
    })
    expect(id).not.toContain('local text')
    expect(id).not.toContain('remote text')
  })

  it('rejects malformed conflict diff ids', () => {
    expect(parseConflictDiffDocumentId(null)).toBe(null)
    expect(parseConflictDiffDocumentId('git-diff:v2:%7B%7D')).toBe(null)
    expect(parseConflictDiffDocumentId('conflict-diff:')).toBe(null)
    expect(parseConflictDiffDocumentId('conflict-diff:%E0%A4%A')).toBe(null)
  })

  it('formats labels and titles from the backing path', () => {
    expect(conflictDiffDocumentLabel('/repo/src/app.ts')).toBe('app.ts')
    expect(conflictDiffDocumentTitle('/repo/src/app.ts')).toBe('/repo/src/app.ts conflict editor')
  })
})
