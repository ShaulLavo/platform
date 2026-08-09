import {
  tabStripScrollLeft,
  type TabStripScrollBounds,
} from '@/features/workbench/utils/tab-strip-scroll'
import { expect, test } from '../../../../../test/fixtures'

/** A 400px strip scrolled 100px in, with an 8px gutter at each edge. */
function bounds(overrides: Partial<TabStripScrollBounds> = {}): TabStripScrollBounds {
  return {
    gutter: 8,
    scrollLeft: 100,
    stripLeft: 0,
    stripRight: 400,
    tabLeft: 100,
    tabRight: 244,
    ...overrides,
  }
}

test('a tab already inside the strip does not move it', () => {
  expect(tabStripScrollLeft(bounds())).toBeNull()
})

test('a tab sitting exactly in the gutter still counts as visible', () => {
  expect(tabStripScrollLeft(bounds({ tabLeft: 8, tabRight: 152 }))).toBeNull()
  expect(tabStripScrollLeft(bounds({ tabLeft: 248, tabRight: 392 }))).toBeNull()
})

test('a tab clipped on the left scrolls back just far enough to clear it', () => {
  expect(tabStripScrollLeft(bounds({ tabLeft: -20, tabRight: 124 }))).toBe(72)
})

test('a tab clipped on the right scrolls forward just far enough to clear it', () => {
  expect(tabStripScrollLeft(bounds({ tabLeft: 300, tabRight: 444 }))).toBe(152)
})

test('a tab wider than the strip aligns to its left edge', () => {
  const wide = bounds({ stripRight: 100, tabLeft: -20, tabRight: 300 })

  expect(tabStripScrollLeft(wide)).toBe(72)
})

test('a fully hidden tab is revealed at the gutter, not centered', () => {
  const offscreen = bounds({ tabLeft: 900, tabRight: 1044 })

  expect(tabStripScrollLeft(offscreen)).toBe(752)
})
