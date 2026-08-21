import { describe, expect, it } from 'vitest'

import { searchResultsNeedDiskRefresh } from '@/features/search/utils/dirty-overlay-refresh'

describe('dirty overlay refresh', () => {
  it('overlays in place while the dirty set only grows', () => {
    const overlaid = new Set(['repo/a.ts'])
    const dirty = new Set(['repo/a.ts', 'repo/b.ts'])

    expect(searchResultsNeedDiskRefresh(overlaid, dirty)).toBe(false)
  })

  it('re-runs the disk search when a dirty buffer is saved', () => {
    const overlaid = new Set(['repo/a.ts'])
    const dirty = new Set<string>()

    expect(searchResultsNeedDiskRefresh(overlaid, dirty)).toBe(true)
  })

  it('re-runs the disk search when a dirty buffer is renamed away', () => {
    const overlaid = new Set(['repo/old.ts'])
    const dirty = new Set(['repo/new.ts'])

    expect(searchResultsNeedDiskRefresh(overlaid, dirty)).toBe(true)
  })

  it('re-runs the disk search when one of several dirty buffers is deleted', () => {
    const overlaid = new Set(['repo/a.ts', 'repo/b.ts'])
    const dirty = new Set(['repo/a.ts'])

    expect(searchResultsNeedDiskRefresh(overlaid, dirty)).toBe(true)
  })

  it('overlays in place when nothing was overlaid yet', () => {
    expect(searchResultsNeedDiskRefresh(new Set(), new Set(['repo/a.ts']))).toBe(false)
  })
})
