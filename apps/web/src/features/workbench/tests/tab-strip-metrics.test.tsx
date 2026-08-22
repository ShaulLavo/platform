import { createTabStripMetrics } from '@/features/workbench/state/tab-strip-metrics'
import { expect, test } from '../../../../test/fixtures'

function mountStrip(tabIds: readonly string[]) {
  const strip = document.createElement('div')
  document.body.appendChild(strip)
  for (const id of tabIds) addTab(strip, id)

  return strip
}

function addTab(strip: HTMLElement, id: string) {
  const tab = document.createElement('button')
  tab.dataset.editorTabId = id
  strip.appendChild(tab)
  return tab
}

/** The reads the cache exists to avoid — the ones that force a layout mid-commit. */
function countRectReads(run: () => void): number {
  const original = Element.prototype.getBoundingClientRect
  let reads = 0
  Element.prototype.getBoundingClientRect = function getBoundingClientRect(this: Element) {
    reads += 1
    return original.call(this)
  }
  try {
    run()
  } finally {
    Element.prototype.getBoundingClientRect = original
  }

  return reads
}

test('answering from the cache measures nothing', () => {
  const strip = mountStrip(['a', 'b'])
  const metrics = createTabStripMetrics(strip)

  let bounds = null
  const reads = countRectReads(() => {
    bounds = metrics.boundsFor('b')
  })

  expect(bounds).not.toBeNull()
  expect(reads).toBe(0)
  metrics.dispose()
  strip.remove()
})

test('a strip whose tabs changed since the last read refuses to answer', () => {
  const strip = mountStrip(['a', 'b'])
  const metrics = createTabStripMetrics(strip)
  expect(metrics.boundsFor('b')).not.toBeNull()

  addTab(strip, 'c')

  // Null rather than a stale offset: the caller measures instead, so a freshly opened tab is
  // still revealed on the frame it appears.
  expect(metrics.boundsFor('b')).toBeNull()
  expect(metrics.boundsFor('c')).toBeNull()
  metrics.dispose()
  strip.remove()
})

test('a reordered strip refuses to answer even though the tabs are the same', () => {
  const strip = mountStrip(['a', 'b'])
  const metrics = createTabStripMetrics(strip)
  expect(metrics.boundsFor('a')).not.toBeNull()

  strip.insertBefore(strip.children[1]!, strip.children[0]!)

  expect(metrics.boundsFor('a')).toBeNull()
  metrics.dispose()
  strip.remove()
})

test('the window it reports is where the strip is heading, not where it is', () => {
  const strip = mountStrip(['a'])
  const metrics = createTabStripMetrics(strip)

  const before = metrics.boundsFor('a')
  // A reveal animates, so the next switch has to reason about the offset it will land on.
  metrics.noteScrollTarget(64)
  const after = metrics.boundsFor('a')

  expect(before?.scrollLeft).toBe(0)
  expect(after?.scrollLeft).toBe(64)
  expect(after!.stripRight - after!.stripLeft).toBe(before!.stripRight - before!.stripLeft)
  metrics.dispose()
  strip.remove()
})

test('an interrupted reveal stops answering from a target nothing will reach', () => {
  const strip = mountStrip(['a'])
  const metrics = createTabStripMetrics(strip)
  metrics.noteScrollTarget(64)
  expect(metrics.boundsFor('a')?.scrollLeft).toBe(64)

  strip.dispatchEvent(new Event('wheel'))

  expect(metrics.boundsFor('a')?.scrollLeft).toBe(strip.scrollLeft)
  metrics.dispose()
  strip.remove()
})

test('the measured fallback speaks the same content space as the cache', () => {
  const strip = mountStrip(['a', 'b'])
  const metrics = createTabStripMetrics(strip)

  expect(metrics.measure('b')).toEqual(metrics.boundsFor('b'))
  expect(metrics.measure('missing')).toBeNull()
  metrics.dispose()
  strip.remove()
})
