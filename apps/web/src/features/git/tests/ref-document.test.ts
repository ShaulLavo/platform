import { describe, expect, it } from 'vitest'

import { parseRefDocumentId, refDocumentId, refDocumentLabel } from '../ref-document'

describe('git ref document ids', () => {
  it('round-trips a path and ref', () => {
    const id = refDocumentId({ path: 'src/app.ts', ref: 'HEAD' })

    expect(parseRefDocumentId(id)).toEqual({ path: 'src/app.ts', ref: 'HEAD' })
  })

  // Both halves can contain ':', which is why the payload is encoded rather than joined.
  it('round-trips values containing colons and slashes', () => {
    const info = { path: 'src/a:b.ts', ref: 'refs/heads/feat:x' }

    expect(parseRefDocumentId(refDocumentId(info))).toEqual(info)
  })

  it('rejects ids of other document kinds', () => {
    expect(parseRefDocumentId('src/app.ts')).toBeNull()
    expect(parseRefDocumentId('git-diff:v2:abc')).toBeNull()
    expect(parseRefDocumentId(null)).toBeNull()
  })

  it('rejects malformed or incomplete payloads', () => {
    expect(parseRefDocumentId('git-ref:not-json')).toBeNull()
    expect(parseRefDocumentId(`git-ref:${encodeURIComponent('{"path":"a"}')}`)).toBeNull()
    expect(
      parseRefDocumentId(`git-ref:${encodeURIComponent('{"path":"a","ref":"b","version":2}')}`),
    ).toBeNull()
    expect(
      parseRefDocumentId(`git-ref:${encodeURIComponent('{"path":"","ref":"b","version":1}')}`),
    ).toBeNull()
  })

  it('labels the tab with the file name and ref', () => {
    expect(refDocumentLabel(refDocumentId({ path: 'src/app.ts', ref: 'HEAD' }))).toBe(
      'app.ts (HEAD)',
    )
  })
})
