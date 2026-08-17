import { describe, expect, it } from 'vitest'

import { createEditorDocumentStore } from '@/features/editor/state/document-state'
import type { FileResult } from '@/lib/file-system-types'

describe('editor document store state identity', () => {
  it('keeps unrelated slices referentially stable across scroll updates', () => {
    const store = createEditorDocumentStore()
    store.getState().ensureEditorView('tab-1', fileResult('/repo/a.ts'))
    store.getState().ensureEditorView('tab-2', fileResult('/repo/b.ts'))
    const before = store.getState()

    store.getState().setEditorViewScrollPosition('tab-1', { left: 0, top: 120 })
    const after = store.getState()

    expect(after.scrollPositionByTabId['tab-1']).toEqual({ left: 0, top: 120 })
    expect(after.documentContentRevisions).toBe(before.documentContentRevisions)
    expect(after.dirtyFilePaths).toBe(before.dirtyFilePaths)
    expect(after.liveDocumentsById).toBe(before.liveDocumentsById)

    // Only the scrolled tab's view projection is replaced; its stable fields
    // and the other tab's projection keep their identity.
    expect(after.viewsByTabId['tab-1']).not.toBe(before.viewsByTabId['tab-1'])
    expect(after.viewsByTabId['tab-1']?.view).toBe(before.viewsByTabId['tab-1']?.view)
    expect(after.viewsByTabId['tab-2']).toBe(before.viewsByTabId['tab-2'])
  })

  it('keeps other document projections stable across text changes', () => {
    const store = createEditorDocumentStore()
    store.getState().ensureEditorView('tab-1', fileResult('/repo/a.ts'))
    store.getState().ensureEditorView('tab-2', fileResult('/repo/b.ts'))
    const before = store.getState()

    store.getState().recordLiveEditorDocumentTextChange('/repo/a.ts')
    const after = store.getState()

    expect(after.liveDocumentsById).not.toBe(before.liveDocumentsById)
    expect(after.liveDocumentsById['/repo/a.ts']).not.toBe(before.liveDocumentsById['/repo/a.ts'])
    expect(after.liveDocumentsById['/repo/b.ts']).toBe(before.liveDocumentsById['/repo/b.ts'])
    expect(after.viewsByTabId).toBe(before.viewsByTabId)
  })

  it('restores the seeded scroll position when a view is created', () => {
    const store = createEditorDocumentStore({
      scrollPositionSeeds: { '/repo/a.ts': { left: 0, top: 480 } },
    })

    const view = store.getState().ensureEditorView('tab-1', fileResult('/repo/a.ts'))

    expect(view.scrollPosition).toEqual({ left: 0, top: 480 })
    expect(view.view.getScrollPosition()).toEqual({ left: 0, top: 480 })
  })

  it('reopens a closed tab at its last scroll position', () => {
    const store = createEditorDocumentStore()
    store.getState().ensureEditorView('tab-1', fileResult('/repo/a.ts'))
    store.getState().setEditorViewScrollPosition('tab-1', { left: 0, top: 240 })
    store.getState().removeEditorView('tab-1')

    const reopened = store.getState().ensureEditorView('tab-2', fileResult('/repo/a.ts'))

    expect(reopened.scrollPosition).toEqual({ left: 0, top: 240 })
  })
})

function fileResult(path: string): FileResult {
  return {
    content: `contents of ${path}`,
    mtimeMs: 100,
    path,
    size: 20,
    version: `test:${path}`,
  }
}
