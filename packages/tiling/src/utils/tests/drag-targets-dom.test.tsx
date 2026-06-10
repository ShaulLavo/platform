import { afterEach, describe, expect, it } from 'vitest'

import type { ResolvedTilingTarget } from '@workspace/tiling/utils/drop-target-resolver'
import {
  promoteWindowCenterTabTarget,
  resolveIntentModeAndUpdateDetach,
} from '@workspace/tiling/utils/drag-targets'
import { initialTabDragTravel, type ActiveTilingDrag } from '@workspace/tiling/utils/drag-state'
import { fileEditorSurfaceId, workbenchWindowId } from '@workspace/tiling/utils/layout-ids'

const sourceSurfaceId = fileEditorSurfaceId('/repo/src/source.ts')
const targetWindowId = workbenchWindowId('drag:target')

describe('tiling drag target promotion', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('promotes window-center snap targets to app-owned tab insertion targets', () => {
    mountWindowWithTabStrip()
    const target: ResolvedTilingTarget = {
      candidateId: 'window-center',
      mode: 'tab-detached',
      target: {
        destination: { kind: 'window-center', windowId: targetWindowId },
        kind: 'snap-destination',
      },
    }

    expect(
      promoteWindowCenterTabTarget({ kind: 'tab', surfaceId: sourceSurfaceId }, target, {
        x: 120,
        y: 150,
      }),
    ).toEqual({
      mode: 'tab-detached',
      previewKind: 'app',
      target: { index: 1, kind: 'tab-strip', windowId: targetWindowId },
    })
  })

  it('re-attaches a detached tab when the pointer returns to its source strip', () => {
    mountWindowWithTabStrip()
    const source = { kind: 'tab', surfaceId: sourceSurfaceId } as const
    const activeDrag: ActiveTilingDrag = {
      detached: true,
      kind: 'tab',
      pointerType: 'mouse',
      source,
      sourceIndex: 0,
      sourceWindowId: targetWindowId,
      stripOrientation: 'horizontal',
      stripRect: { height: 40, width: 200, x: 0, y: 0 },
      travel: initialTabDragTravel(),
    }

    expect(resolveIntentModeAndUpdateDetach(activeDrag, source, { x: 100, y: 120 })).toBe(
      'tab-detached',
    )
    expect(activeDrag.detached).toBe(true)

    expect(resolveIntentModeAndUpdateDetach(activeDrag, source, { x: 100, y: 20 })).toBe(
      'tab-reorder',
    )
    expect(activeDrag.detached).toBe(false)
  })
})

function mountWindowWithTabStrip() {
  const windowElement = document.createElement('section')
  windowElement.dataset.tilingWindowId = targetWindowId
  windowElement.getBoundingClientRect = () => rect({ height: 300, width: 400, x: 0, y: 0 })

  const stripElement = document.createElement('div')
  stripElement.dataset.tilingTabStripId = targetWindowId
  stripElement.dataset.tilingTabStripOrientation = 'horizontal'
  stripElement.getBoundingClientRect = () => rect({ height: 40, width: 200, x: 0, y: 0 })
  stripElement.append(tabElement('left', 0), tabElement('right', 100))

  document.body.append(windowElement, stripElement)
}

function tabElement(id: string, x: number) {
  const element = document.createElement('button')
  element.dataset.tilingTabId = id
  element.getBoundingClientRect = () => rect({ height: 40, width: 100, x, y: 0 })

  return element
}

function rect({
  height,
  width,
  x,
  y,
}: {
  readonly height: number
  readonly width: number
  readonly x: number
  readonly y: number
}): DOMRect {
  return {
    bottom: y + height,
    height,
    left: x,
    right: x + width,
    toJSON: () => ({}),
    top: y,
    width,
    x,
    y,
  }
}
