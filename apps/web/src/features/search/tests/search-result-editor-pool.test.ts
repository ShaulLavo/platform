import { describe, expect, it } from 'vitest'

import type { SearchResultRenderedFileResultItem } from '@/features/search/search-result-editor-types'

import {
  createSearchResultFileEditorPoolState,
  nextSearchResultFileEditorPoolKeys,
  syncSearchResultFileEditorPoolEntries,
} from '../search-result-editor-pool'

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

  it('preserves entry and array identity when the pool is unchanged', () => {
    const item = searchResultFileItem('file:a')
    const first = syncSearchResultFileEditorPoolEntries(
      createSearchResultFileEditorPoolState(),
      [item],
      true,
    )
    const next = syncSearchResultFileEditorPoolEntries(first, [item], true)

    expect(next).toBe(first)
    expect(next.entries).toBe(first.entries)
    expect(next.entries[0]).toBe(first.entries[0])
  })

  it('reuses a new visible item wrapper when the rendered item inputs are unchanged', () => {
    const item = searchResultFileItem('file:a')
    const wrapper = { ...item }
    const first = syncSearchResultFileEditorPoolEntries(
      createSearchResultFileEditorPoolState(),
      [item],
      true,
    )
    const next = syncSearchResultFileEditorPoolEntries(first, [wrapper], true)

    expect(next).toBe(first)
    expect(next.entries[0]).toBe(first.entries[0])
    expect(next.entries[0]?.item).toBe(item)
  })

  it('replaces only entries whose visibility changes', () => {
    const itemA = searchResultFileItem('file:a')
    const itemB = searchResultFileItem('file:b')
    const first = syncSearchResultFileEditorPoolEntries(
      createSearchResultFileEditorPoolState(),
      [itemA],
      true,
    )
    const next = syncSearchResultFileEditorPoolEntries(first, [itemB], true)

    expect(next.entries.map((entry) => entry.key)).toEqual(['file:a', 'file:b'])
    expect(next.entries[0]).not.toBe(first.entries[0])
    expect(next.entries[0]?.visible).toBe(false)
    expect(next.entries[0]?.item).toBe(itemA)
  })

  it('replaces an entry when the cached item reference changes', () => {
    const firstItem = searchResultFileItem('file:a', 0)
    const nextItem = searchResultFileItem('file:a', 1)
    const first = syncSearchResultFileEditorPoolEntries(
      createSearchResultFileEditorPoolState(),
      [firstItem],
      true,
    )
    const next = syncSearchResultFileEditorPoolEntries(first, [nextItem], true)

    expect(next.entries).not.toBe(first.entries)
    expect(next.entries[0]).not.toBe(first.entries[0])
    expect(next.entries[0]?.item).toBe(nextItem)
  })
})

function searchResultFileItem(id: string, index = 0): SearchResultRenderedFileResultItem {
  return {
    renderKey: id,
    row: {
      file: {
        id,
      },
      type: 'file-results',
    },
    virtualItem: {
      index,
      key: id,
      size: 20,
      start: index * 20,
    },
  } as SearchResultRenderedFileResultItem
}
