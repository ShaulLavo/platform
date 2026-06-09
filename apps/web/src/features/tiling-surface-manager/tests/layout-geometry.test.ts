import { describe, expect, it } from 'vitest'

import {
  CLASSIC_DIAGNOSTICS_NODE_ID,
  CLASSIC_EDITOR_NODE_ID,
  CLASSIC_EDITOR_WINDOW_ID,
  CLASSIC_FILE_NAVIGATOR_NODE_ID,
  CLASSIC_FILE_NAVIGATOR_WINDOW_ID,
  CLASSIC_MAIN_NODE_ID,
  CLASSIC_ROOT_NODE_ID,
  createClassicFirstRunWorkspaceLayout,
  createEmptyWorkspaceLayout,
  createPlaceholderSurface,
} from '@/features/tiling-surface-manager/engine/layout-builders'
import {
  deriveLayoutGeometry,
  deriveNodeRects,
  deriveResizeHandleRects,
  deriveSnapDestinationRects,
  type LayoutRect,
} from '@/features/tiling-surface-manager/engine/layout-geometry'
import {
  findNodeIdForWindow,
  findWindowIdContainingSurface,
} from '@/features/tiling-surface-manager/engine/layout-normalize'
import {
  collapseWindow,
  openSurface,
} from '@/features/tiling-surface-manager/engine/layout-operations'
import type { WorkspaceLayout } from '@/features/tiling-surface-manager/engine/layout-types'

describe('tiling surface layout geometry', () => {
  it('derives horizontal and vertical n-ary split rects with visible gaps', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const rect = rootRect()
    const nodeRects = deriveNodeRects(layout, rect, { gapPx: 10 })

    expectRect(nodeRects[CLASSIC_FILE_NAVIGATOR_NODE_ID], {
      height: 800,
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
      width: 772.2,
      x: 227.8,
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

    expect(rootHandle?.axis).toBe('horizontal')
    expect(rootHandle?.resizeReferencePx).toBeCloseTo(990)
    expectRect(rootHandle?.rect, { height: 800, width: 8, x: 218.8, y: 0 })
    expect(mainHandle?.axis).toBe('vertical')
    expect(mainHandle?.resizeReferencePx).toBeCloseTo(790)
    expectRect(mainHandle?.rect, { height: 8, width: 772.2, x: 227.8, y: 585.6 })
  })

  it('allocates collapsed split children as fixed accordion headers', () => {
    const base = createClassicFirstRunWorkspaceLayout()
    const layout = {
      ...base,
      windowsById: {
        ...base.windowsById,
        [CLASSIC_FILE_NAVIGATOR_WINDOW_ID]: {
          ...base.windowsById[CLASSIC_FILE_NAVIGATOR_WINDOW_ID],
          mode: 'collapsed',
        },
      },
    } satisfies WorkspaceLayout
    const nodeRects = deriveNodeRects(layout, rootRect(), { gapPx: 10 })

    expectRect(nodeRects[CLASSIC_FILE_NAVIGATOR_NODE_ID], {
      height: 800,
      width: 40,
      x: 0,
      y: 0,
    })
    expectRect(nodeRects[CLASSIC_EDITOR_NODE_ID], {
      height: 584.6,
      width: 950,
      x: 50,
      y: 0,
    })
  })

  it('allocates a collapsed single root window as a header row', () => {
    const surface = createPlaceholderSurface({
      canCollapse: true,
      canClose: true,
      contextKey: 'single-root-collapse',
      title: 'Single Root',
    })
    const opened = openSurface(createEmptyWorkspaceLayout(), surface)
    const windowId = findWindowIdContainingSurface(opened, surface.id)
    if (!windowId) throw new Error('Expected opened surface window')

    const collapsed = collapseWindow(opened, windowId)
    const nodeId = findNodeIdForWindow(collapsed, windowId)
    if (!nodeId) throw new Error('Expected collapsed window node')

    const geometry = deriveLayoutGeometry(collapsed, rootRect(), { gapPx: 10 })

    expectRect(geometry.nodeRectsById[nodeId], { height: 40, width: 1000, x: 0, y: 0 })
    expectRect(geometry.windowRectsById[windowId]?.rect, { height: 40, width: 1000, x: 0, y: 0 })
  })

  it('derives background, recipe-slot, root, parent, window-edge, and center snap destinations', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const geometry = deriveLayoutGeometry(layout, rootRect(), {
      minSnapDestinationPx: 20,
      snapEdgeRatio: 0.2,
    })
    const editorCenter = geometry.snapDestinationRects.find(
      (destination) =>
        destination.kind === 'window-center' && destination.windowId === CLASSIC_EDITOR_WINDOW_ID,
    )
    const rootLeft = geometry.snapDestinationRects.find(
      (destination) => destination.kind === 'root-edge' && destination.edge === 'left',
    )
    const parentEditorLeft = geometry.snapDestinationRects.find(
      (destination) =>
        destination.kind === 'parent-edge' &&
        destination.edge === 'left' &&
        destination.destination.kind === 'parent-edge' &&
        destination.destination.nodeId === CLASSIC_EDITOR_NODE_ID,
    )
    const background = geometry.snapDestinationRects.find(
      (destination) => destination.kind === 'background',
    )
    const editorRecipeSlot = geometry.snapDestinationRects.find(
      (destination) =>
        destination.destination.kind === 'recipe-slot' &&
        destination.destination.slot === 'editor-center',
    )

    expect(background?.destination.kind).toBe('background')
    expect(editorRecipeSlot?.kind).toBe('recipe-slot')
    expect(editorCenter?.destination.kind).toBe('window-center')
    expectRect(rootLeft?.rect, { height: 800, width: 200, x: 0, y: 0 })
    expect(parentEditorLeft?.destination.kind).toBe('parent-edge')
  })

  it('exposes the same derivations through the full geometry helper', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const geometry = deriveLayoutGeometry(layout, rootRect())
    const snapDestinationRects = deriveSnapDestinationRects(
      layout,
      rootRect(),
      geometry.nodeRectsById,
      geometry.windowRectsById,
    )

    expect(geometry.windowRectsById[CLASSIC_EDITOR_WINDOW_ID]?.nodeId).toBe(CLASSIC_EDITOR_NODE_ID)
    expect(geometry.nodeRectsById[CLASSIC_ROOT_NODE_ID]).toEqual(rootRect())
    expect(snapDestinationRects.length).toBe(geometry.snapDestinationRects.length)
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
