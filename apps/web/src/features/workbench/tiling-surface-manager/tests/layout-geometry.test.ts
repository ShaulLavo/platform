import { describe, expect, it } from 'vitest'

import {
  CLASSIC_DIAGNOSTICS_NODE_ID,
  CLASSIC_EDITOR_NODE_ID,
  CLASSIC_EDITOR_WINDOW_ID,
  CLASSIC_FILE_NAVIGATOR_NODE_ID,
  CLASSIC_MAIN_NODE_ID,
  CLASSIC_ROOT_NODE_ID,
  createClassicFirstRunWorkspaceLayout,
} from '../layout-builders'
import {
  deriveDropZoneRects,
  deriveLayoutGeometry,
  deriveNodeRects,
  deriveResizeHandleRects,
  type LayoutRect,
} from '../layout-geometry'

describe('tiling surface layout geometry', () => {
  it('derives horizontal and vertical n-ary split rects with visible gaps', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const rect = rootRect()
    const nodeRects = deriveNodeRects(layout, rect, { gapPx: 10 })

    expectRect(nodeRects[CLASSIC_FILE_NAVIGATOR_NODE_ID], {
      height: 584.6,
      width: 217.8,
      x: 0,
      y: 0,
    })
    expectRect(nodeRects[CLASSIC_EDITOR_NODE_ID], {
      height: 584.6,
      width: 772.2,
      x: 227.8,
      y: 0,
    })
    expectRect(nodeRects[CLASSIC_DIAGNOSTICS_NODE_ID], {
      height: 205.4,
      width: 1000,
      x: 0,
      y: 594.6,
    })
  })

  it('derives resize handles between split children', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const nodeRects = deriveNodeRects(layout, rootRect(), { gapPx: 10 })
    const handles = deriveResizeHandleRects(layout, nodeRects, {
      resizeHandleThicknessPx: 8,
    })
    const rootHandle = handles.find((handle) => handle.splitId === CLASSIC_ROOT_NODE_ID)
    const mainHandle = handles.find((handle) => handle.splitId === CLASSIC_MAIN_NODE_ID)

    expect(rootHandle?.axis).toBe('vertical')
    expectRect(rootHandle?.rect, { height: 8, width: 1000, x: 0, y: 585.6 })
    expect(mainHandle?.axis).toBe('horizontal')
    expectRect(mainHandle?.rect, { height: 584.6, width: 8, x: 218.8, y: 0 })
  })

  it('derives root, parent, window-edge, and center drop zones', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const geometry = deriveLayoutGeometry(layout, rootRect(), {
      dropEdgeRatio: 0.2,
      minDropZonePx: 20,
    })
    const editorCenter = geometry.dropZoneRects.find(
      (zone) => zone.kind === 'window-center' && zone.windowId === CLASSIC_EDITOR_WINDOW_ID,
    )
    const rootLeft = geometry.dropZoneRects.find(
      (zone) => zone.kind === 'root-edge' && zone.edge === 'left',
    )
    const parentEditorLeft = geometry.dropZoneRects.find(
      (zone) =>
        zone.kind === 'parent-edge' &&
        zone.edge === 'left' &&
        zone.destination.kind === 'parent-edge' &&
        zone.destination.nodeId === CLASSIC_EDITOR_NODE_ID,
    )

    expect(editorCenter?.destination.kind).toBe('window-center')
    expectRect(rootLeft?.rect, { height: 800, width: 200, x: 0, y: 0 })
    expect(parentEditorLeft?.destination.kind).toBe('parent-edge')
  })

  it('exposes the same derivations through the full geometry helper', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const geometry = deriveLayoutGeometry(layout, rootRect())
    const dropZones = deriveDropZoneRects(
      layout,
      rootRect(),
      geometry.nodeRectsById,
      geometry.windowRectsById,
    )

    expect(geometry.windowRectsById[CLASSIC_EDITOR_WINDOW_ID]?.nodeId).toBe(CLASSIC_EDITOR_NODE_ID)
    expect(geometry.nodeRectsById[CLASSIC_ROOT_NODE_ID]).toEqual(rootRect())
    expect(dropZones.length).toBe(geometry.dropZoneRects.length)
  })
})

function rootRect(): LayoutRect {
  return { height: 800, width: 1000, x: 0, y: 0 }
}

function expectRect(actual: LayoutRect | undefined, expected: LayoutRect) {
  if (!actual) throw new Error('Expected rect')

  expect(actual.x).toBeCloseTo(expected.x)
  expect(actual.y).toBeCloseTo(expected.y)
  expect(actual.width).toBeCloseTo(expected.width)
  expect(actual.height).toBeCloseTo(expected.height)
}
