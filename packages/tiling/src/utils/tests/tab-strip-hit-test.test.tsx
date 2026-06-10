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

  it('gates docking halos by the drag direction from the source strip', () => {
    mountTestTabStrip({
      rect: { height: 40, width: 200, x: 0, y: 0 },
      tabs: [testTabRect('tab-a', { height: 40, width: 100, x: 0, y: 0 })],
      windowId: targetWindowId,
    })

    const upwardHit = tabStripDropHitAtPoint(
      source,
      { x: 80, y: 80 },
      {
        sourceStripOrientation: 'horizontal',
        sourceStripRect: { height: 40, width: 200, x: 0, y: 180 },
      },
    )
    const downwardMiss = tabStripDropHitAtPoint(
      source,
      { x: 80, y: 80 },
      {
        sourceStripOrientation: 'horizontal',
        sourceStripRect: { height: 40, width: 200, x: 0, y: 20 },
      },
    )

    expect(upwardHit).toEqual({
      strength: 'dock',
      target: { index: 1, kind: 'tab-strip', windowId: targetWindowId },
    })
    expect(downwardMiss).toBeNull()
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

    expect(
      tabStripDropTargetForWindowBodyPoint(
        targetWindowId,
        { x: 242, y: 200 },
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
        { x: 229, y: 200 },
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
