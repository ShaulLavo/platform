import { describe, expect, it } from 'vitest'

import {
  balancedColumnCount,
  packLayoutIntoBalancedColumns,
  partitionIntoBalancedColumns,
  windowIdsInReadingOrder,
} from '@workspace/tiling/utils/balanced-columns'
import {
  createEmptyWorkspaceLayout,
  createPlaceholderSurface,
} from '@workspace/tiling/utils/layout-builders'
import { checkWorkspaceLayoutInvariants } from '@workspace/tiling/utils/layout-invariants'
import { deriveNodeRects, type LayoutRect } from '@workspace/tiling/utils/layout-geometry'
import {
  findNodeIdForWindow,
  findWindowIdContainingSurface,
  visibleWindowIdsInOrder,
} from '@workspace/tiling/utils/layout-normalize'
import { moveSurface, openSurface } from '@workspace/tiling/utils/layout-operations'
import { createTilingInvariantError } from '@workspace/tiling/utils/structured-errors'
import type { WindowId, WorkspaceLayout } from '@workspace/tiling/utils/layout-types'

const UNIT_RECT: LayoutRect = { height: 1, width: 1, x: 0, y: 0 }

describe('balanced column packing', () => {
  it('grows the column count with the square root of the item count', () => {
    const expectedCounts = new Map([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 2],
      [4, 2],
      [5, 3],
      [6, 3],
      [9, 3],
      [10, 4],
    ])

    for (const [itemCount, columnCount] of expectedCounts) {
      expect(balancedColumnCount(itemCount)).toBe(columnCount)
    }
  })

  it('fills the shortest column in arrival order', () => {
    expect(partitionIntoBalancedColumns([1, 2])).toEqual([[1], [2]])
    expect(partitionIntoBalancedColumns([1, 2, 3])).toEqual([[1, 3], [2]])
    expect(partitionIntoBalancedColumns([1, 2, 3, 4])).toEqual([
      [1, 3],
      [2, 4],
    ])
    expect(partitionIntoBalancedColumns([1, 2, 3, 4, 5])).toEqual([[1, 4], [2, 5], [3]])
    expect(partitionIntoBalancedColumns([1, 2, 3, 4, 5, 6])).toEqual([
      [1, 4],
      [2, 5],
      [3, 6],
    ])
  })

  it('packs three windows into a split first column and a full-height second column', () => {
    const { layout, windowIds } = packedLayoutWithWindowCount(3)
    const [first, second, third] = windowIds

    expect(windowCell(layout, first)).toMatchObject({ x: 0, y: 0, width: 0.5, height: 0.5 })
    expect(windowCell(layout, third)).toMatchObject({ x: 0, y: 0.5, width: 0.5, height: 0.5 })
    expect(windowCell(layout, second)).toMatchObject({ x: 0.5, y: 0, width: 0.5, height: 1 })
    expect(checkWorkspaceLayoutInvariants(layout).ok).toBe(true)
  })

  it('repacks four windows into a two by two grid', () => {
    const { layout, windowIds } = packedLayoutWithWindowCount(4)
    const [first, second, third, fourth] = windowIds

    expect(windowCell(layout, first)).toMatchObject({ x: 0, y: 0 })
    expect(windowCell(layout, second)).toMatchObject({ x: 0.5, y: 0 })
    expect(windowCell(layout, third)).toMatchObject({ x: 0, y: 0.5 })
    expect(windowCell(layout, fourth)).toMatchObject({ x: 0.5, y: 0.5 })
  })

  it('moves to three columns at five windows while keeping arrival order', () => {
    const { layout, windowIds } = packedLayoutWithWindowCount(5)
    const [first, second, third, fourth, fifth] = windowIds
    const third1 = 1 / 3
    const third2 = 2 / 3

    expect(windowCell(layout, first).x).toBeCloseTo(0)
    expect(windowCell(layout, first).y).toBeCloseTo(0)
    expect(windowCell(layout, fourth).x).toBeCloseTo(0)
    expect(windowCell(layout, fourth).y).toBeCloseTo(0.5)
    expect(windowCell(layout, second).x).toBeCloseTo(third1)
    expect(windowCell(layout, fifth).x).toBeCloseTo(third1)
    expect(windowCell(layout, fifth).y).toBeCloseTo(0.5)
    expect(windowCell(layout, third).x).toBeCloseTo(third2)
    expect(windowCell(layout, third).height).toBeCloseTo(1)
  })

  it('recovers arrival order from a packed grid by reading positions', () => {
    const { layout, windowIds } = packedLayoutWithWindowCount(5)

    expect(windowIdsInReadingOrder(layout, visibleWindowIdsInOrder(layout))).toEqual(windowIds)
  })

  it('keeps a single window layout untouched', () => {
    const { layout } = packedLayoutWithWindowCount(1)

    expect(visibleWindowIdsInOrder(layout)).toHaveLength(1)
    expect(checkWorkspaceLayoutInvariants(layout).ok).toBe(true)
  })
})

function packedLayoutWithWindowCount(windowCount: number): {
  readonly layout: WorkspaceLayout
  readonly windowIds: readonly WindowId[]
} {
  let layout = createEmptyWorkspaceLayout()
  const windowIds: WindowId[] = []

  for (let index = 0; index < windowCount; index += 1) {
    const surface = createPlaceholderSurface({
      canClose: true,
      contextKey: `balanced-test-${index + 1}`,
      title: `Surface ${index + 1}`,
    })
    layout = openSurface(layout, surface)
    if (index > 0) {
      layout = moveSurface(layout, surface.id, { edge: 'right', kind: 'root-edge' })
    }

    const windowId = findWindowIdContainingSurface(layout, surface.id)
    if (!windowId) throw createTilingInvariantError('Expected window for opened surface')

    windowIds.push(windowId)
    layout = packLayoutIntoBalancedColumns(layout, [
      ...windowIdsInReadingOrder(
        layout,
        visibleWindowIdsInOrder(layout).filter((id) => id !== windowId),
      ),
      windowId,
    ])
  }

  return { layout, windowIds }
}

function windowCell(layout: WorkspaceLayout, windowId: WindowId | undefined): LayoutRect {
  if (!windowId) throw createTilingInvariantError('Expected window id')

  const nodeId = findNodeIdForWindow(layout, windowId)
  if (!nodeId) throw createTilingInvariantError(`Expected node for ${windowId}`)

  const rect = deriveNodeRects(layout, UNIT_RECT)[nodeId]
  if (!rect) throw createTilingInvariantError(`Expected rect for ${windowId}`)

  return rect
}
