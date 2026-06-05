import { describe, expect, it } from 'bun:test'

import {
  CHROME_TAB_OVERLAP,
  CHROME_TAB_TRAILING_SLOT_WIDTH,
  chromeTabLayout,
} from '@/components/workspace/editor-tabs/utils/chrome-tab-layout'

describe('chromeTabLayout', () => {
  it('keeps normal tabs at standard width when there is room', () => {
    const layout = chromeTabLayout({
      activeIndex: 0,
      availableWidth: 800,
      tabCount: 3,
    })

    expect(layout.overlap).toBe(0)
    expect(layout.tabs.map((tab) => tab.width)).toEqual([224, 224, 224])
  })

  it('shrinks normal tabs evenly when space gets tighter', () => {
    const layout = chromeTabLayout({
      activeIndex: 0,
      availableWidth: 600,
      tabCount: 4,
    })

    expect(layout.overlap).toBe(0)
    expect(layout.tabs.map((tab) => tab.width)).toEqual([150, 150, 150, 150])
    expect(layout.trackWidth).toBe(600)
  })

  it('uses the full available strip until tabs reach standard width', () => {
    const layout = chromeTabLayout({
      activeIndex: 0,
      availableWidth: 700,
      tabCount: 4,
    })

    expect(layout.overlap).toBe(0)
    expect(layout.tabs.map((tab) => tab.width)).toEqual([175, 175, 175, 175])
    expect(layout.trackWidth).toBe(700)
  })

  it('waits until minimum widths overflow before overlapping tabs', () => {
    const layout = chromeTabLayout({
      activeIndex: 3,
      availableWidth: 400,
      tabCount: 6,
    })

    expect(layout.overlap).toBe(0)
    expect(layout.tabs.map((tab) => tab.width)).toEqual([64, 64, 64, 80, 64, 64])
    expect(layout.trackWidth).toBe(400)
  })

  it('overlaps tabs as a last resort when minimum widths barely overflow', () => {
    const layout = chromeTabLayout({
      activeIndex: 3,
      availableWidth: 360,
      tabCount: 6,
    })

    expect(layout.overlap).toBe(8)
    expect(layout.tabs.map((tab) => tab.width)).toEqual([64, 64, 64, 80, 64, 64])
    expect(layout.trackWidth).toBe(360)
  })

  it('overflows with minimum widths when the strip cannot fit', () => {
    const layout = chromeTabLayout({
      activeIndex: 0,
      availableWidth: 10,
      tabCount: 3,
    })

    expect(layout.overlap).toBe(CHROME_TAB_OVERLAP)
    expect(layout.tabs.map((tab) => tab.width)).toEqual([80, 64, 64])
    expect(layout.trackWidth).toBe(172)
  })

  it('does not advance tabs by the max overlap when there is enough room', () => {
    const layout = chromeTabLayout({
      activeIndex: 0,
      availableWidth: 800,
      tabCount: 3,
    })

    expect(layout.overlap).toBe(0)
    expect(layout.tabs.map((tab) => tab.x)).toEqual([0, 224, 448])
    expect(layout.trackWidth).toBe(224 * 3)
  })

  it('advances each tab by width minus the active overlap', () => {
    const layout = chromeTabLayout({
      activeIndex: 3,
      availableWidth: 360,
      tabCount: 6,
    })

    expect(layout.tabs.map((tab) => tab.x)).toEqual([0, 56, 112, 168, 240, 296])
    expect(layout.trackWidth).toBe(360)
  })

  it('adds trailing slot width to standard tabs when there is room', () => {
    const layout = chromeTabLayout({
      activeIndex: 0,
      availableWidth: 800,
      tabCount: 3,
      trailingSlotWidths: [CHROME_TAB_TRAILING_SLOT_WIDTH, 0, 0],
    })

    expect(layout.overlap).toBe(0)
    expect(layout.tabs.map((tab) => tab.width)).toEqual([252, 224, 224])
    expect(layout.trackWidth).toBe(700)
  })

  it('shrinks content while preserving a reserved trailing slot', () => {
    const layout = chromeTabLayout({
      activeIndex: 0,
      availableWidth: 600,
      tabCount: 4,
      trailingSlotWidths: [0, CHROME_TAB_TRAILING_SLOT_WIDTH, 0, 0],
    })

    expect(layout.overlap).toBe(0)
    expect(layout.tabs.map((tab) => tab.width)).toEqual([143, 171, 143, 143])
    expect(layout.trackWidth).toBe(600)
  })

  it('overlaps after minimum widths include trailing slots', () => {
    const layout = chromeTabLayout({
      activeIndex: 3,
      availableWidth: 360,
      tabCount: 6,
      trailingSlotWidths: [0, CHROME_TAB_TRAILING_SLOT_WIDTH, 0, 0, 0, 0],
    })

    expect(layout.overlap).toBeCloseTo(13.6)
    expect(layout.tabs.map((tab) => tab.width)).toEqual([64, 92, 64, 80, 64, 64])
    expect(layout.trackWidth).toBeCloseTo(360)
  })
})
