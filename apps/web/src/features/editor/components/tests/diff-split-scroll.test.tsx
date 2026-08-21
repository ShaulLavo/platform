import { waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { createDiffRegionStore, createTextDiff } from '@singapor/diff'

import { DiffEditor } from '@/features/editor/components/diff-editor'
import { expect, test } from '../../../../../test/fixtures'
import { renderWithProviders } from '../../../../../test/render'

// Split is two editors holding two documents, and nothing in the editor keeps them together — the
// panes stay readable only because the host mirrors one pane's scroll onto the other. Both axes:
// `setScrollTop` on a view contribution is vertical-only, which is why this is host code at all.

const LINE_COUNT = 80

test('scrolling one split pane carries the other with it', async () => {
  const { left, right } = await mountSplitDiff()

  left.scrollTop = 120
  left.dispatchEvent(new Event('scroll'))

  await waitFor(() => expect(right.scrollTop).toBe(120))

  // And back the other way, so the mirroring is not one-directional and does not oscillate.
  right.scrollTop = 45
  right.dispatchEvent(new Event('scroll'))

  await waitFor(() => expect(left.scrollTop).toBe(45))
  expect(right.scrollTop).toBe(45)
})

test('the horizontal axis rides on the same signal as the vertical one', async () => {
  // Not a second copy of the test above: the two axes travel differently. The virtualizer owns the
  // vertical offset and hands it back folded, while `scrollLeft` stays a plain DOM property — so a
  // bridge can very easily carry one and silently drop the other.
  const { left, right } = await mountSplitDiff()

  left.scrollLeft = 70
  left.dispatchEvent(new Event('scroll'))

  await waitFor(() => expect(right.scrollLeft).toBe(70))
})

async function mountSplitDiff() {
  stubHighlightApi()
  const text = (replacements: Record<number, string> = {}) =>
    `${Array.from({ length: LINE_COUNT }, (_, index) => replacements[index + 1] ?? `line ${index + 1}`).join('\n')}\n`
  const file = createTextDiff({
    newFile: {
      path: 'repo/a.ts',
      text: text({ 4: 'four changed', 70: 'a much longer line than any of its neighbours' }),
    },
    oldFile: { path: 'repo/a.ts', text: text() },
  })

  renderWithProviders(
    <StrictMode>
      <DiffEditor file={file} mode='split' regions={createDiffRegionStore()} />
    </StrictMode>,
  )

  await waitFor(() => expect(paneScroller('old')).not.toBeNull())

  return { left: paneScroller('old')!, right: paneScroller('new')! }
}

function paneScroller(side: 'new' | 'old') {
  return document.querySelector<HTMLElement>(`.editor-diff-pane-${side} .editor-virtualized`)
}

function stubHighlightApi() {
  class HighlightStub extends Set<unknown> {}
  Object.assign(globalThis, { Highlight: HighlightStub })
  Object.assign(globalThis.CSS ?? {}, { highlights: new Map() })
}
