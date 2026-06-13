import {
  ROOT_GRAVITY_MARGIN_RATIO,
  WINDOW_CENTER_HALF_EXTENT,
  type ResolvedTilingTarget,
} from '@workspace/tiling/utils/drop-target-resolver'
import type { LayoutRect } from '@workspace/tiling/utils/layout-geometry'
import type { LayoutEdge, WindowId } from '@workspace/tiling/utils/layout-types'

type DropRegionWedge = LayoutEdge | 'center'

// What the resolved target means for the partition overlay: which window the
// pointer is acting on and which wedge, or a whole-workspace root dock.
export type DropRegionFocus = {
  readonly rootEdge: LayoutEdge | null
  readonly wedge: DropRegionWedge | null
  readonly windowId: WindowId | null
}

const EMPTY_FOCUS: DropRegionFocus = { rootEdge: null, wedge: null, windowId: null }

export function dropRegionFocus(target: ResolvedTilingTarget | null): DropRegionFocus {
  const dropTarget = target?.target
  if (!dropTarget) return EMPTY_FOCUS
  if (dropTarget.kind === 'tab' || dropTarget.kind === 'tab-strip') {
    return { rootEdge: null, wedge: 'center', windowId: dropTarget.windowId }
  }
  if (dropTarget.kind === 'window') {
    return { rootEdge: null, wedge: 'center', windowId: dropTarget.windowId }
  }
  if (dropTarget.kind !== 'snap-destination') return EMPTY_FOCUS

  return focusForDestination(dropTarget.destination)
}

function focusForDestination(
  destination: Extract<
    ResolvedTilingTarget['target'],
    { readonly kind: 'snap-destination' }
  >['destination'],
): DropRegionFocus {
  if (destination.kind === 'window-edge') {
    return { rootEdge: null, wedge: destination.edge, windowId: destination.windowId }
  }
  if (destination.kind === 'window-center') {
    return { rootEdge: null, wedge: 'center', windowId: destination.windowId }
  }
  if (destination.kind === 'root-edge') {
    return { rootEdge: destination.edge, wedge: null, windowId: null }
  }

  return EMPTY_FOCUS
}

// The triangle from the two corners of an edge to the window center. The four
// wedges tile the window, so every interior point falls in exactly one.
export function wedgeTrianglePoints(rect: LayoutRect, edge: LayoutEdge): string {
  const left = rect.x
  const top = rect.y
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height
  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2
  if (edge === 'top') return polygonPoints([left, top], [right, top], [centerX, centerY])
  if (edge === 'right') return polygonPoints([right, top], [right, bottom], [centerX, centerY])
  if (edge === 'bottom') return polygonPoints([right, bottom], [left, bottom], [centerX, centerY])

  return polygonPoints([left, bottom], [left, top], [centerX, centerY])
}

export function regionCenterRect(rect: LayoutRect): LayoutRect {
  const width = rect.width * WINDOW_CENTER_HALF_EXTENT
  const height = rect.height * WINDOW_CENTER_HALF_EXTENT

  return {
    height,
    width,
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - height) / 2,
  }
}

export function rootEdgeRibbonRect(rootRect: LayoutRect, edge: LayoutEdge): LayoutRect {
  const thicknessX = rootRect.width * ROOT_GRAVITY_MARGIN_RATIO
  const thicknessY = rootRect.height * ROOT_GRAVITY_MARGIN_RATIO
  if (edge === 'left') return { ...rootRect, width: thicknessX }
  if (edge === 'right') {
    return { ...rootRect, width: thicknessX, x: rootRect.x + rootRect.width - thicknessX }
  }
  if (edge === 'top') return { ...rootRect, height: thicknessY }

  return { ...rootRect, height: thicknessY, y: rootRect.y + rootRect.height - thicknessY }
}

function polygonPoints(...pairs: ReadonlyArray<readonly [number, number]>): string {
  return pairs.map(([x, y]) => `${x},${y}`).join(' ')
}
