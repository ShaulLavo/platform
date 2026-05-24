import { describe, expect, it } from 'bun:test'

import { nextSearchResultFileEditorPoolKeys } from './search-result-editor-pool'

describe('search result editor pool', () => {
  it('keeps visible file slots keyed by file id and preserves current slot order', () => {
    expect(
      nextSearchResultFileEditorPoolKeys(
        ['file:a', 'file:b', 'file:c', 'file:d', 'file:e'],
        ['file:c', 'file:f'],
        true,
      ),
    ).toEqual(['file:a', 'file:c', 'file:f'])
  })

  it('drops hidden file slots while prewarming is disabled', () => {
    expect(
      nextSearchResultFileEditorPoolKeys(['file:a', 'file:b', 'file:c'], ['file:b'], false),
    ).toEqual(['file:b'])
  })

  it('caps retained hidden slots to the recent pool size', () => {
    expect(
      nextSearchResultFileEditorPoolKeys(
        ['file:a', 'file:b', 'file:c', 'file:d', 'file:e', 'file:f'],
        ['file:g'],
        true,
      ),
    ).toEqual(['file:a', 'file:g'])
  })
})
