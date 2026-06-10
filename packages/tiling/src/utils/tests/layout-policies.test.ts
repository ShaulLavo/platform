import { describe, expect, it } from 'vitest'

import {
  CLASSIC_EDITOR_WINDOW_ID,
  createClassicFirstRunWorkspaceLayout,
  createDiagnosticsSurface,
  createDiffSurface,
  createFileEditorSurface,
  createFileNavigatorSurface,
  createGitChangesSurface,
  createLogsSurface,
  createSearchPreviewSurface,
  createSearchResultsSurface,
  createTerminalSurface,
} from '@workspace/tiling/utils/layout-builders'
import { findWindowIdContainingSurface } from '@workspace/tiling/utils/layout-normalize'
import { openSurface } from '@workspace/tiling/utils/layout-operations'
import {
  FOCUS_POLICY_ID,
  LANE_WORKFLOW_POLICY_ID,
  MASTER_DETAIL_POLICY_ID,
  PREVIEW_ADJACENT_POLICY_ID,
  placementForSurfaceWithPolicy,
} from '@workspace/tiling/utils/layout-policies'
import { createTilingInvariantError } from '@workspace/tiling/utils/structured-errors'
import type { Surface, WorkspaceRecipeSlot } from '@workspace/tiling/utils/layout-types'

describe('tiling surface layout policies', () => {
  it('maps classic surface types to recipe slots', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const entries: readonly [Surface, WorkspaceRecipeSlot][] = [
      [createFileNavigatorSurface(), 'left-tool-pane'],
      [createFileEditorSurface({ path: '/repo/src/app.ts' }), 'editor-center'],
      [createDiffSurface({ diffDocumentId: 'diff:/repo/src/app.ts' }), 'editor-center'],
      [createSearchResultsSurface(), 'left-tool-pane'],
      [createTerminalSurface({ sessionId: 'terminal-1' }), 'bottom'],
      [createGitChangesSurface(), 'left-tool-pane'],
      [createLogsSurface(), 'left-tool-pane'],
      [createDiagnosticsSurface(), 'bottom'],
    ]

    for (const [surface, slot] of entries) {
      expect(placementForSurfaceWithPolicy({ layout, surface })).toEqual({
        kind: 'recipe-slot',
        slot,
      })
    }
  })

  it('places transient previews adjacent to their owner surface', () => {
    const search = createSearchResultsSurface()
    const layout = openSurface(createClassicFirstRunWorkspaceLayout(), search)
    const preview = createSearchPreviewSurface({
      ownerContextKey: 'result:/repo/src/app.ts:1',
      ownerSurfaceId: search.id,
    })
    const ownerWindowId = findWindowIdContainingSurface(layout, search.id)
    if (!ownerWindowId) throw createTilingInvariantError('Expected visible search owner')

    expect(
      placementForSurfaceWithPolicy({
        layout,
        policyId: PREVIEW_ADJACENT_POLICY_ID,
        surface: preview,
      }),
    ).toEqual({ edge: 'right', kind: 'window-edge', windowId: ownerWindowId })
  })

  it('uses master-detail root edges for side and bottom surfaces', () => {
    const layout = createClassicFirstRunWorkspaceLayout()

    expect(
      placementForSurfaceWithPolicy({
        layout,
        policyId: MASTER_DETAIL_POLICY_ID,
        surface: createGitChangesSurface(),
      }),
    ).toEqual({ edge: 'right', kind: 'root-edge' })
    expect(
      placementForSurfaceWithPolicy({
        layout,
        policyId: MASTER_DETAIL_POLICY_ID,
        surface: createTerminalSurface({ sessionId: 'terminal-policy' }),
      }),
    ).toEqual({ edge: 'bottom', kind: 'root-edge' })
  })

  it('focus policy tabs new surfaces into the active window', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const file = createFileEditorSurface({ path: '/repo/src/focused.ts' })

    expect(
      placementForSurfaceWithPolicy({
        layout,
        policyId: FOCUS_POLICY_ID,
        surface: file,
      }),
    ).toEqual({ kind: 'window-center', windowId: CLASSIC_EDITOR_WINDOW_ID })
  })

  it('lane workflow placeholder routes owned surfaces into the owner window', () => {
    const search = createSearchResultsSurface()
    const layout = openSurface(createClassicFirstRunWorkspaceLayout(), search)
    const preview = createSearchPreviewSurface({
      ownerContextKey: 'result:/repo/src/lane.ts:1',
      ownerSurfaceId: search.id,
    })
    const ownerWindowId = findWindowIdContainingSurface(layout, search.id)
    if (!ownerWindowId) throw createTilingInvariantError('Expected visible search owner')

    expect(
      placementForSurfaceWithPolicy({
        layout,
        policyId: LANE_WORKFLOW_POLICY_ID,
        surface: preview,
      }),
    ).toEqual({ kind: 'window-center', windowId: ownerWindowId })
  })
})
