import { describe, expect, it } from 'vitest'

import type { TilingDropData } from '@workspace/tiling/utils/drag-data'
import type { ResolvedTilingTarget } from '@workspace/tiling/utils/drop-target-resolver'
import { initialTabDragTravel, type ActiveTilingDrag } from '@workspace/tiling/utils/drag-state'
import {
  previousTargetTabIndexForWindow,
  rawWindowTargetForDrag,
  resolveIntentModeAndUpdateDetach,
  sourceReturnTargetForDragEnd,
  tabTargetFromHit,
  tabTargetFromTarget,
} from '@workspace/tiling/utils/drag-targets'
import { fileEditorSurfaceId, workbenchWindowId } from '@workspace/tiling/utils/layout-ids'

const sourceSurfaceId = fileEditorSurfaceId('/repo/src/source.ts')
const targetSurfaceId = fileEditorSurfaceId('/repo/src/target.ts')
const sourceWindowId = workbenchWindowId('drag:source')
const targetWindowId = workbenchWindowId('drag:target')

describe('tiling drag targets', () => {
  it('keeps tab drags in reorder mode until the detach threshold is crossed', () => {
    const source = { kind: 'tab', surfaceId: sourceSurfaceId } as const
    const activeDrag = activeTabDrag()

    expect(resolveIntentModeAndUpdateDetach(activeDrag, source, { x: 50, y: 34 })).toBe(
      'tab-reorder',
    )
    expect(activeDrag.detached).toBe(false)

    expect(resolveIntentModeAndUpdateDetach(activeDrag, source, { x: 50, y: 35 })).toBe(
      'tab-detached',
    )
    expect(activeDrag.detached).toBe(true)

    expect(resolveIntentModeAndUpdateDetach(activeDrag, source, { x: 50, y: 10 })).toBe(
      'tab-detached',
    )
  })

  it('uses the touch detach threshold for touch tab drags', () => {
    const source = { kind: 'tab', surfaceId: sourceSurfaceId } as const
    const activeDrag = activeTabDrag({ pointerType: 'touch' })

    expect(resolveIntentModeAndUpdateDetach(activeDrag, source, { x: 50, y: 69 })).toBe(
      'tab-reorder',
    )
    expect(resolveIntentModeAndUpdateDetach(activeDrag, source, { x: 50, y: 70 })).toBe(
      'tab-detached',
    )
  })

  it('falls back to raw window targets only for valid drag modes', () => {
    const rawTarget = { kind: 'window', windowId: targetWindowId } as const
    const tabSource = { kind: 'tab', surfaceId: sourceSurfaceId } as const
    const windowSource = { kind: 'window', windowId: sourceWindowId } as const

    expect(rawWindowTargetForDrag({ mode: 'tab-detached', rawTarget, source: tabSource })).toEqual({
      mode: 'tab-detached',
      target: rawTarget,
    })
    expect(rawWindowTargetForDrag({ mode: 'tab-reorder', rawTarget, source: tabSource })).toBeNull()
    expect(rawWindowTargetForDrag({ mode: 'window', rawTarget, source: windowSource })).toEqual({
      mode: 'window',
      target: rawTarget,
    })
    expect(
      rawWindowTargetForDrag({
        mode: 'window',
        rawTarget: { kind: 'window', windowId: sourceWindowId },
        source: windowSource,
      }),
    ).toBeNull()
  })

  it('prioritizes direct tab hits over dock and strip hits', () => {
    const target = tabStripTarget(1)
    const directTarget = tabTargetFromHit({ strength: 'direct', target })
    const dockTarget = tabTargetFromHit({ strength: 'dock', target })
    const stripTarget = tabTargetFromHit({ strength: 'strip', target })

    expect(directTarget?.priority).toBeGreaterThan(dockTarget?.priority ?? 0)
    expect(dockTarget?.priority).toBeGreaterThan(stripTarget?.priority ?? 0)
    expect(tabTargetFromTarget(target)?.priority).toBe(directTarget?.priority)
  })

  it('returns source-return targets only for the dragged window', () => {
    const source = { kind: 'window', windowId: sourceWindowId } as const
    const target: ResolvedTilingTarget = {
      candidateId: 'source-return:right',
      mode: 'window',
      target: { kind: 'window', windowId: sourceWindowId },
    }

    expect(sourceReturnTargetForDragEnd(source, target)).toBe(target)
    expect(
      sourceReturnTargetForDragEnd(source, {
        ...target,
        target: { kind: 'window', windowId: targetWindowId },
      }),
    ).toBeNull()
    expect(sourceReturnTargetForDragEnd({ kind: 'tab', surfaceId: sourceSurfaceId }, target)).toBe(
      null,
    )
  })

  it('reads previous tab indices only when the previous target belongs to the window', () => {
    const previousTarget: ResolvedTilingTarget = {
      mode: 'tab-detached',
      previewKind: 'app',
      target: tabTarget(2),
    }

    expect(previousTargetTabIndexForWindow(previousTarget, targetWindowId)).toBe(2)
    expect(previousTargetTabIndexForWindow(previousTarget, sourceWindowId)).toBeNull()
    expect(previousTargetTabIndexForWindow(null, targetWindowId)).toBeNull()
  })
})

function activeTabDrag(
  patch: Partial<Extract<ActiveTilingDrag, { readonly kind: 'tab' }>> = {},
): Extract<ActiveTilingDrag, { readonly kind: 'tab' }> {
  return {
    detached: false,
    kind: 'tab',
    pointerType: 'mouse',
    source: { kind: 'tab', surfaceId: sourceSurfaceId },
    sourceIndex: 0,
    sourceWindowId,
    stripOrientation: 'horizontal',
    stripRect: { height: 20, width: 100, x: 0, y: 0 },
    travel: initialTabDragTravel(),
    ...patch,
  }
}

function tabTarget(index: number): Extract<TilingDropData, { readonly kind: 'tab' }> {
  return {
    index,
    kind: 'tab',
    surfaceId: targetSurfaceId,
    windowId: targetWindowId,
  }
}

function tabStripTarget(index: number): Extract<TilingDropData, { readonly kind: 'tab-strip' }> {
  return {
    index,
    kind: 'tab-strip',
    windowId: targetWindowId,
  }
}
