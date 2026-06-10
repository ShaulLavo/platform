import { describe, expect, it } from 'vitest'

import type { ResolvedTilingTarget } from '@workspace/tiling/utils/drop-target-resolver'
import {
  dropTargetCanCommit,
  previewLayoutForTarget,
  tilingDragTargetLayout,
} from '@workspace/tiling/utils/drag-layout'
import {
  CLASSIC_EDITOR_WINDOW_ID,
  createClassicFirstRunWorkspaceLayout,
  createFileEditorSurface,
} from '@workspace/tiling/utils/layout-builders'
import { checkWorkspaceLayoutInvariants } from '@workspace/tiling/utils/layout-invariants'
import { workbenchWindowId } from '@workspace/tiling/utils/layout-ids'
import { findWindowIdContainingSurface } from '@workspace/tiling/utils/layout-normalize'
import { moveSurface, openSurface } from '@workspace/tiling/utils/layout-operations'
import { createTilingInvariantError } from '@workspace/tiling/utils/structured-errors'
import type { SurfaceId, WindowId, WorkspaceLayout } from '@workspace/tiling/utils/layout-types'

describe('tiling drag layout mapping', () => {
  it('tabs a dragged surface to the end of a window target', () => {
    const { fileId, layout, sourceWindowId } = splitFileFromEditor('/repo/src/tab-window.ts')
    const moved = tilingDragTargetLayout(
      layout,
      { kind: 'tab', surfaceId: fileId },
      { kind: 'window', windowId: CLASSIC_EDITOR_WINDOW_ID },
    )

    expect(findWindowIdContainingSurface(moved, fileId)).toBe(CLASSIC_EDITOR_WINDOW_ID)
    expect(moved.windowsById[CLASSIC_EDITOR_WINDOW_ID].surfaceIds.at(-1)).toBe(fileId)
    expect(moved.windowsById[sourceWindowId]).toBeUndefined()
    expectValidLayout(moved)
  })

  it('moves a dragged window to the right edge of a window target', () => {
    const { fileId, layout, sourceWindowId } = splitFileFromEditor('/repo/src/window-edge.ts')
    const moved = tilingDragTargetLayout(
      layout,
      { kind: 'window', windowId: sourceWindowId },
      { kind: 'window', windowId: CLASSIC_EDITOR_WINDOW_ID },
    )

    expect(findWindowIdContainingSurface(moved, fileId)).toBe(sourceWindowId)
    expect(moved.windowsById[sourceWindowId]).toBeDefined()
    expectValidLayout(moved)
  })

  it('merges a dragged window into tab-strip targets at the requested index', () => {
    const { fileId, layout, sourceWindowId } = splitFileFromEditor('/repo/src/window-tabs.ts')
    const sourceSurfaceIds = layout.windowsById[sourceWindowId].surfaceIds
    const targetSurfaceIds = layout.windowsById[CLASSIC_EDITOR_WINDOW_ID].surfaceIds
    const moved = tilingDragTargetLayout(
      layout,
      { kind: 'window', windowId: sourceWindowId },
      { index: 1, kind: 'tab-strip', windowId: CLASSIC_EDITOR_WINDOW_ID },
    )

    expect(moved.windowsById[sourceWindowId]).toBeUndefined()
    expect(findWindowIdContainingSurface(moved, fileId)).toBe(CLASSIC_EDITOR_WINDOW_ID)
    expect(moved.windowsById[CLASSIC_EDITOR_WINDOW_ID].surfaceIds).toEqual([
      targetSurfaceIds[0],
      ...sourceSurfaceIds,
      ...targetSurfaceIds.slice(1),
    ])
    expectValidLayout(moved)
  })

  it('guards commits against missing layout targets', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const missingWindowId = workbenchWindowId('drag:missing')

    expect(dropTargetCanCommit(layout, { kind: 'window', windowId: missingWindowId })).toBe(false)
    expect(
      dropTargetCanCommit(layout, {
        destination: { edge: 'left', kind: 'window-edge', windowId: missingWindowId },
        kind: 'snap-destination',
      }),
    ).toBe(false)
    expect(
      dropTargetCanCommit(layout, {
        destination: { edge: 'left', kind: 'root-edge' },
        kind: 'snap-destination',
      }),
    ).toBe(true)
  })

  it('keeps dnd-kit tab previews external but previews window merges immediately', () => {
    const { fileId, layout, sourceWindowId } = splitFileFromEditor('/repo/src/preview.ts')
    const tabSource = { kind: 'tab', surfaceId: fileId } as const
    const dndTarget: ResolvedTilingTarget = {
      mode: 'tab-detached',
      previewKind: 'dnd-kit',
      target: { index: 0, kind: 'tab-strip', windowId: CLASSIC_EDITOR_WINDOW_ID },
    }
    const mergeTarget: ResolvedTilingTarget = {
      mode: 'window',
      previewKind: 'dnd-kit',
      target: { index: 0, kind: 'tab-strip', windowId: CLASSIC_EDITOR_WINDOW_ID },
    }

    expect(previewLayoutForTarget(layout, tabSource, dndTarget)).toBeNull()

    const preview = previewLayoutForTarget(
      layout,
      { kind: 'window', windowId: sourceWindowId },
      mergeTarget,
    )
    expect(preview?.windowsById[sourceWindowId]).toBeUndefined()
    expect(preview && findWindowIdContainingSurface(preview, fileId)).toBe(CLASSIC_EDITOR_WINDOW_ID)
  })
})

function splitFileFromEditor(path: string): {
  readonly fileId: SurfaceId
  readonly layout: WorkspaceLayout
  readonly sourceWindowId: WindowId
} {
  const file = createFileEditorSurface({ path })
  const opened = openSurface(createClassicFirstRunWorkspaceLayout(), file)
  const layout = moveSurface(opened, file.id, {
    edge: 'right',
    kind: 'window-edge',
    windowId: CLASSIC_EDITOR_WINDOW_ID,
  })
  const sourceWindowId = findWindowIdContainingSurface(layout, file.id)
  if (!sourceWindowId) throw createTilingInvariantError(`Expected visible surface ${file.id}`)

  return {
    fileId: file.id,
    layout,
    sourceWindowId,
  }
}

function expectValidLayout(layout: WorkspaceLayout) {
  expect(checkWorkspaceLayoutInvariants(layout)).toEqual({
    ok: true,
    violations: [],
  })
}
