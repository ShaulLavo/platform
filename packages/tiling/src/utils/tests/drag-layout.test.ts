import { describe, expect, it } from 'vitest'

import type { ResolvedTilingTarget } from '@workspace/tiling/utils/drop-target-resolver'
import {
  dragTargetForCommit,
  dropTargetCanCommit,
  previewLayoutForTarget,
  tilingDragTargetLayout,
} from '@workspace/tiling/utils/drag-layout'
import {
  CLASSIC_DIAGNOSTICS_WINDOW_ID,
  CLASSIC_EDITOR_WINDOW_ID,
  CLASSIC_FILE_NAVIGATOR_WINDOW_ID,
  createClassicFirstRunWorkspaceLayout,
  createFileEditorSurface,
  createLogsSurface,
  createSearchResultsSurface,
} from '@workspace/tiling/utils/layout-builders'
import { checkWorkspaceLayoutInvariants } from '@workspace/tiling/utils/layout-invariants'
import {
  CLASSIC_POLICY_ID,
  terminalSurfaceId,
  workbenchWindowId,
} from '@workspace/tiling/utils/layout-ids'
import { findWindowIdContainingSurface } from '@workspace/tiling/utils/layout-normalize'
import { moveSurface, openSurface, restoreSurface } from '@workspace/tiling/utils/layout-operations'
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

  it('commits terminal tab merges into editor windows', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const terminalId = terminalSurfaceId('terminal-1')
    const source = { kind: 'tab', surfaceId: terminalId } as const
    const target = { index: 1, kind: 'tab-strip', windowId: CLASSIC_EDITOR_WINDOW_ID } as const

    expect(dragTargetForCommit(layout, source, target)).toBe(target)

    const moved = tilingDragTargetLayout(layout, source, target)

    expect(moved.windowsById[CLASSIC_EDITOR_WINDOW_ID].surfaceIds).toContain(terminalId)
    expectValidLayout(moved)
  })

  it('commits left tool tab merges into the file navigator window', () => {
    const search = createSearchResultsSurface()
    const layout = restoreSurface(createClassicFirstRunWorkspaceLayout(), search.id)
    const source = { kind: 'tab', surfaceId: search.id } as const
    const target = {
      index: 1,
      kind: 'tab-strip',
      windowId: CLASSIC_FILE_NAVIGATOR_WINDOW_ID,
    } as const

    expect(dragTargetForCommit(layout, source, target)).toBe(target)

    const moved = tilingDragTargetLayout(layout, source, target)

    expect(moved.windowsById[CLASSIC_FILE_NAVIGATOR_WINDOW_ID].surfaceIds).toContain(search.id)
    expect(findWindowIdContainingSurface(moved, search.id)).toBe(CLASSIC_FILE_NAVIGATOR_WINDOW_ID)
    expectValidLayout(moved)
  })

  it('commits logs tab merges into the bottom pane', () => {
    const logs = createLogsSurface()
    const layout = openSurface(createClassicFirstRunWorkspaceLayout(), logs)
    const source = { kind: 'tab', surfaceId: logs.id } as const
    const target = {
      index: 2,
      kind: 'tab-strip',
      windowId: CLASSIC_DIAGNOSTICS_WINDOW_ID,
    } as const

    expect(dragTargetForCommit(layout, source, target)).toBe(target)

    const moved = tilingDragTargetLayout(layout, source, target)

    expect(moved.windowsById[CLASSIC_DIAGNOSTICS_WINDOW_ID].surfaceIds).toContain(logs.id)
    expect(findWindowIdContainingSurface(moved, logs.id)).toBe(CLASSIC_DIAGNOSTICS_WINDOW_ID)
    expectValidLayout(moved)
  })

  it('keeps manual edge drops available for recipe-managed surfaces', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const terminalId = terminalSurfaceId('terminal-1')
    const source = { kind: 'tab', surfaceId: terminalId } as const
    const target = {
      destination: { edge: 'left', kind: 'root-edge' },
      kind: 'snap-destination',
    } as const
    const commitTarget = dragTargetForCommit(layout, source, target)

    expect(commitTarget).toBe(target)

    const moved = tilingDragTargetLayout(layout, source, target)

    expect(findWindowIdContainingSurface(moved, terminalId)).not.toBe(CLASSIC_DIAGNOSTICS_WINDOW_ID)
    expect(moved.policiesById[CLASSIC_POLICY_ID].stickyPlacementsBySurfaceId[terminalId]).toEqual({
      edge: 'left',
      kind: 'root-edge',
    })
    expectValidLayout(moved)
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
