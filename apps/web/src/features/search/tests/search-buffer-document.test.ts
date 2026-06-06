import { describe, expect, it } from 'vitest'

import {
  parseSearchBufferDocumentId,
  searchBufferDocumentId,
  searchBufferDocumentLabel,
  searchBufferDocumentTitle,
} from '../search-buffer-document'

describe('search buffer document ids', () => {
  it('round-trips root paths', () => {
    const id = searchBufferDocumentId('Users/shaul/project')

    expect(parseSearchBufferDocumentId(id)).toEqual({
      id,
      rootPath: 'Users/shaul/project',
    })
  })

  it('formats tab labels and titles', () => {
    expect(searchBufferDocumentLabel()).toBe('Search')
    expect(searchBufferDocumentTitle('Users/shaul/project')).toBe(
      '/Users/shaul/project search results',
    )
  })
})
