import { editorPerformanceDomSnapshot } from '@/features/editor/state/performance-trace'
import { expect, test } from '../../../../test/fixtures'

test('DOM counters exclude rows and scrollers from the cached snapshot overlay', () => {
  const liveScroller = document.createElement('div')
  liveScroller.className = 'editor-virtualized'
  const liveRow = document.createElement('div')
  liveRow.className = 'editor-virtualized-row'
  liveRow.textContent = 'live'
  liveScroller.append(liveRow)

  const overlay = document.createElement('div')
  overlay.dataset.editorVisibleSnapshot = ''
  const cachedScroller = document.createElement('div')
  cachedScroller.className = 'editor-virtualized'
  const cachedRow = document.createElement('div')
  cachedRow.className = 'editor-virtualized-row'
  cachedRow.textContent = 'cached'
  cachedScroller.append(cachedRow)
  overlay.append(cachedScroller)
  document.body.append(liveScroller, overlay)

  try {
    expect(editorPerformanceDomSnapshot(document)).toMatchObject({
      editorRows: 1,
      editorRowTextCharacters: 4,
      editorScrollers: 1,
    })
  } finally {
    liveScroller.remove()
    overlay.remove()
  }
})
