import { render } from '@testing-library/react'

import { useActiveTabStripScroll } from '@/features/workbench/hooks/use-active-tab-strip-scroll'
import { expect, test } from '../../../../test/fixtures'

function Strip({ activeTabId }: { activeTabId: string | null }) {
  const stripRef = useActiveTabStripScroll(activeTabId)

  return (
    <div ref={stripRef}>
      <button data-editor-tab-id='a' type='button' />
      <button data-editor-tab-id='b' type='button' />
    </div>
  )
}

/**
 * happy-dom reports every box as empty, so a tab is never off screen and nothing is ever revealed.
 * Giving the second tab a box past the strip's right edge is what puts the reveal on the path.
 */
function stubClippedSecondTab() {
  const original = Element.prototype.getBoundingClientRect
  Element.prototype.getBoundingClientRect = function getBoundingClientRect(this: Element) {
    if (this instanceof HTMLElement && this.dataset.editorTabId === 'b') {
      return { left: 400, right: 500, width: 100 } as DOMRect
    }

    return { left: 0, right: 100, width: 100 } as DOMRect
  }

  return () => {
    Element.prototype.getBoundingClientRect = original
  }
}

function recordScrollTo() {
  const original = Element.prototype.scrollTo
  const calls: ScrollToOptions[] = []
  Element.prototype.scrollTo = function scrollTo(options?: ScrollToOptions | number) {
    if (typeof options === 'object') calls.push(options)
  } as Element['scrollTo']

  return {
    calls,
    restore: () => {
      Element.prototype.scrollTo = original
    },
  }
}

function stubReducedMotion(reduce: boolean) {
  const original = window.matchMedia
  window.matchMedia = ((query: string) =>
    ({ matches: reduce, media: query }) as MediaQueryList) as typeof window.matchMedia

  return () => {
    window.matchMedia = original
  }
}

test('revealing a tab scrolls to it instead of jumping', () => {
  const restoreRects = stubClippedSecondTab()
  const restoreMotion = stubReducedMotion(false)
  const scrolls = recordScrollTo()

  try {
    const { rerender } = render(<Strip activeTabId='a' />)
    scrolls.calls.length = 0
    rerender(<Strip activeTabId='b' />)

    expect(scrolls.calls).toHaveLength(1)
    expect(scrolls.calls[0]?.behavior).toBe('smooth')
    expect(scrolls.calls[0]?.left).toBeGreaterThan(0)
  } finally {
    scrolls.restore()
    restoreMotion()
    restoreRects()
  }
})

test('someone who asked the OS for less motion gets none', () => {
  const restoreRects = stubClippedSecondTab()
  const restoreMotion = stubReducedMotion(true)
  const scrolls = recordScrollTo()

  try {
    const { rerender } = render(<Strip activeTabId='a' />)
    scrolls.calls.length = 0
    rerender(<Strip activeTabId='b' />)

    expect(scrolls.calls).toHaveLength(1)
    expect(scrolls.calls[0]?.behavior).toBe('auto')
  } finally {
    scrolls.restore()
    restoreMotion()
    restoreRects()
  }
})
