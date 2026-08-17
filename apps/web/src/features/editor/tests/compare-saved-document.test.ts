import { describe, expect, it } from 'vitest'

import {
  compareSavedDocumentId,
  compareSavedDocumentLabel,
  parseCompareSavedDocumentId,
} from '@/features/editor/utils/compare-saved-document'

describe('compare-saved document ids', () => {
  it('round-trips a path', () => {
    const id = compareSavedDocumentId('src/app.ts')

    expect(parseCompareSavedDocumentId(id)).toBe('src/app.ts')
  })

  it('round-trips paths with characters that need encoding', () => {
    const path = 'src/a b/c#d?e.ts'

    expect(parseCompareSavedDocumentId(compareSavedDocumentId(path))).toBe(path)
  })

  it('rejects ids belonging to other document kinds', () => {
    expect(parseCompareSavedDocumentId('src/app.ts')).toBeNull()
    expect(parseCompareSavedDocumentId('git-diff:v2:abc')).toBeNull()
    expect(parseCompareSavedDocumentId(null)).toBeNull()
    expect(parseCompareSavedDocumentId(undefined)).toBeNull()
  })

  it('rejects an empty payload', () => {
    expect(parseCompareSavedDocumentId('compare-saved:')).toBeNull()
  })

  // A malformed id must not read as a compare document, or it opens an empty tab.
  it('rejects a malformed escape sequence', () => {
    expect(parseCompareSavedDocumentId('compare-saved:%E0%A4%A')).toBeNull()
  })

  it('labels the tab with the file name', () => {
    expect(compareSavedDocumentLabel(compareSavedDocumentId('src/app.ts'))).toBe(
      'app.ts (working tree)',
    )
  })
})
