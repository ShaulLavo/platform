import { afterEach, describe, expect, it } from 'vitest'

import { fileEditorSurfaceId, workbenchWindowId } from '@workspace/tiling/utils/layout-ids'
import {
  describeTabStripHitTest,
  pointIsInsideTilingWindowCenter,
  resolveTabStripDropTarget,
  scrollTabStripForBodyPoint,
  tabStripBodyAutoscrollCanAdvance,
  tabStripDropHitAtPoint,
  tabStripDropTargetForWindowAtPoint,
  tabStripDropTargetForWindowBodyPoint,
  tabStripDropTargetMatchesPoint,
  tilingWindowCenterElementAtPoint,
} from '@workspace/tiling/utils/tab-strip-hit-test'
import {
  mountTestTabStrip,
  mountTestWindow,
  mountTestWindowWithTabStrip,
  testTabRect,
} from '@workspace/tiling/utils/tests/dom-test-elements'

const source = { kind: 'tab', surfaceId: fileEditorSurfaceId('/repo/src/source.ts') } as const
const sourceWindowId = workbenchWindowId('tab-strip:source')
const targetWindowId = workbenchWindowId('tab-strip:target')

describe('tab strip hit testing', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('resolves direct horizontal strip hits to insertion indices', () => {
    mountTestTabStrip({
      rect: { height: 40, width: 200, x: 0, y: 0 },
      tabs: [
        testTabRect('tab-a', { height: 40, width: 100, x: 0, y: 0 }),
        testTabRect('tab-b', { height: 40, width: 100, x: 100, y: 0 }),
        testTabRect('tab-b', { height: 40, width: 100, x: 200, y: 0 }),
      ],
      windowId: targetWindowId,
    })

    const hit = tabStripDropHitAtPoint(source, { x: 125, y: 20 })

    expect(hit).toEqual({
      strength: 'direct',
      target: { index: 1, kind: 'tab-strip', windowId: targetWindowId },
    })
  })

  it('keeps trailing-edge reorder slop bounded to the strip', () => {
    mountTestTabStrip({
      rect: { height: 40, width: 200, x: 0, y: 0 },
      tabs: [
        testTabRect('tab-a', { height: 40, width: 100, x: 0, y: 0 }),
        testTabRect('tab-b', { height: 40, width: 100, x: 100, y: 0 }),
      ],
      windowId: targetWindowId,
    })

    expect(tabStripDropTargetForWindowAtPoint(targetWindowId, { x: 236, y: 20 })).toEqual({
      index: 2,
      kind: 'tab-strip',
      windowId: targetWindowId,
    })
    expect(tabStripDropTargetForWindowAtPoint(targetWindowId, { x: 237, y: 20 })).toBeNull()
  })

  it('gates docking halos by the pointer travel direction', () => {
    mountTestTabStrip({
      rect: { height: 40, width: 200, x: 0, y: 0 },
      tabs: [testTabRect('tab-a', { height: 40, width: 100, x: 0, y: 0 })],
      windowId: targetWindowId,
    })

    const towardHit = tabStripDropHitAtPoint(
      source,
      { x: 80, y: 80 },
      { dockTravel: { horizontal: 'none', vertical: 'up' } },
    )
    const awayMiss = tabStripDropHitAtPoint(
      source,
      { x: 80, y: 80 },
      { dockTravel: { horizontal: 'none', vertical: 'down' } },
    )
    const unknownTravelHit = tabStripDropHitAtPoint(
      source,
      { x: 80, y: 80 },
      { dockTravel: { horizontal: 'none', vertical: 'none' } },
    )

    expect(towardHit).toEqual({
      strength: 'dock',
      target: { index: 1, kind: 'tab-strip', windowId: targetWindowId },
    })
    expect(awayMiss).toBeNull()
    expect(unknownTravelHit?.strength).toBe('dock')
  })

  it('excludes the dragged tab from insertion indices in its own strip', () => {
    mountTestTabStrip({
      rect: { height: 40, width: 300, x: 0, y: 0 },
      tabs: [
        testTabRect('tab-a', { height: 40, width: 100, x: 0, y: 0 }),
        testTabRect(source.surfaceId, { height: 40, width: 100, x: 100, y: 0 }),
        testTabRect('tab-b', { height: 40, width: 100, x: 200, y: 0 }),
      ],
      windowId: targetWindowId,
    })

    // Boundaries come from the other tabs only (mids at 50 and 250), so the
    // whole span between them maps to the single insertion index 1.
    expect(tabStripDropHitAtPoint(source, { x: 120, y: 20 })?.target).toEqual({
      index: 1,
      kind: 'tab-strip',
      windowId: targetWindowId,
    })
    expect(tabStripDropHitAtPoint(source, { x: 240, y: 20 })?.target).toEqual({
      index: 1,
      kind: 'tab-strip',
      windowId: targetWindowId,
    })
    expect(tabStripDropHitAtPoint(source, { x: 260, y: 20 })?.target).toEqual({
      index: 2,
      kind: 'tab-strip',
      windowId: targetWindowId,
    })
  })

  it('projects body points into tab strip coordinates with index hysteresis', () => {
    mountTestWindowWithTabStrip({
      stripRect: { height: 40, width: 200, x: 0, y: 0 },
      tabs: [
        testTabRect('tab-a', { height: 40, width: 100, x: 0, y: 0 }),
        testTabRect('tab-b', { height: 40, width: 100, x: 100, y: 0 }),
      ],
      windowId: targetWindowId,
      windowRect: { height: 300, width: 400, x: 0, y: 60 },
    })

    // x=145 is left of tab-b's midpoint (150) but inside the 18px hysteresis
    // band, so the previous index holds; x=120 is past the band and flips.
    expect(
      tabStripDropTargetForWindowBodyPoint(
        targetWindowId,
        { x: 145, y: 200 },
        {
          previousIndex: 2,
        },
      ),
    ).toEqual({
      index: 2,
      kind: 'tab-strip',
      windowId: targetWindowId,
    })
    expect(
      tabStripDropTargetForWindowBodyPoint(
        targetWindowId,
        { x: 120, y: 200 },
        {
          previousIndex: 2,
        },
      ),
    ).toEqual({
      index: 1,
      kind: 'tab-strip',
      windowId: targetWindowId,
    })
  })

  it('projects body points 1:1 so the insertion slot stays under the pointer', () => {
    mountTestWindowWithTabStrip({
      stripRect: { height: 40, width: 200, x: 0, y: 0 },
      tabs: [
        testTabRect('tab-a', { height: 40, width: 100, x: 0, y: 0 }),
        testTabRect('tab-b', { height: 40, width: 100, x: 100, y: 0 }),
      ],
      windowId: targetWindowId,
      windowRect: { height: 300, width: 400, x: 0, y: 60 },
    })

    const target = (x: number) => ({ kind: 'tab-strip', windowId: targetWindowId, index: x })

    expect(tabStripDropTargetForWindowBodyPoint(targetWindowId, { x: 40, y: 200 })).toEqual(
      target(0),
    )
    expect(tabStripDropTargetForWindowBodyPoint(targetWindowId, { x: 140, y: 200 })).toEqual(
      target(1),
    )
    expect(tabStripDropTargetForWindowBodyPoint(targetWindowId, { x: 390, y: 200 })).toEqual(
      target(2),
    )
  })

  it('scrolls a strip when the body point is inside an autoscroll edge', () => {
    const { stripElement, windowElement } = mountTestWindowWithTabStrip({
      stripRect: { height: 40, width: 200, x: 0, y: 0 },
      tabs: [
        testTabRect('tab-a', { height: 40, width: 100, x: 0, y: 0 }),
        testTabRect('tab-b', { height: 40, width: 100, x: 100, y: 0 }),
      ],
      windowId: targetWindowId,
      windowRect: { height: 300, width: 400, x: 0, y: 60 },
    })

    expect(tabStripBodyAutoscrollCanAdvance(stripElement, windowElement, { x: 390, y: 200 })).toBe(
      true,
    )
    expect(scrollTabStripForBodyPoint(stripElement, windowElement, { x: 390, y: 200 })).toBe(true)
    expect(stripElement.scrollLeft).toBeGreaterThan(0)
  })

  it('finds the smallest mounted window center at the point', () => {
    mountTestWindow(sourceWindowId, { height: 600, width: 600, x: 0, y: 0 })
    const nestedWindow = mountTestWindow(targetWindowId, {
      height: 220,
      width: 220,
      x: 120,
      y: 120,
    })

    expect(pointIsInsideTilingWindowCenter(sourceWindowId, { x: 230, y: 230 })).toBe(true)
    expect(tilingWindowCenterElementAtPoint({ x: 230, y: 230 })).toBe(nestedWindow)
  })

  it('updates tab strip targets only while the point stays in the strip band', () => {
    mountTestTabStrip({
      rect: { height: 40, width: 200, x: 0, y: 0 },
      tabs: [testTabRect('tab-a', { height: 40, width: 100, x: 0, y: 0 })],
      windowId: targetWindowId,
    })
    const target = {
      index: 0,
      kind: 'tab-strip' as const,
      windowId: targetWindowId,
    }

    expect(resolveTabStripDropTarget(source, target, { x: 150, y: 20 })).toEqual({
      index: 1,
      kind: 'tab-strip',
      windowId: targetWindowId,
    })
    expect(tabStripDropTargetMatchesPoint(target, { x: Number.NaN, y: 20 })).toBe(false)
    expect(describeTabStripHitTest(source, { x: 400, y: 400 })).toContain('nearest strip')
  })
})
