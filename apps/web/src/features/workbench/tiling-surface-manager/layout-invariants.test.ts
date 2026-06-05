import { describe, expect, it } from 'bun:test'

import {
  CLASSIC_EDITOR_WINDOW_ID,
  CLASSIC_MAIN_NODE_ID,
  CLASSIC_ROOT_NODE_ID,
  createClassicFirstRunWorkspaceLayout,
  createSearchPreviewSurface,
} from './layout-builders'
import {
  checkWorkspaceLayoutInvariants,
  type LayoutInvariantViolationCode,
} from './layout-invariants'
import { fileEditorSurfaceId, layoutNodeId, workbenchWindowId } from './layout-ids'
import type { LayoutNode, Surface, WorkbenchWindow, WorkspaceLayout } from './layout-types'

describe('tiling surface layout invariants', () => {
  it('accepts the classic first-run builder output', () => {
    expect(checkWorkspaceLayoutInvariants(createClassicFirstRunWorkspaceLayout())).toEqual({
      ok: true,
      violations: [],
    })
  })

  it('reports missing surfaces referenced by windows', () => {
    const missingSurfaceId = fileEditorSurfaceId('/repo/missing.ts')
    const layout = updateWindow(createClassicFirstRunWorkspaceLayout(), CLASSIC_EDITOR_WINDOW_ID, {
      activeSurfaceId: missingSurfaceId,
      surfaceIds: [missingSurfaceId],
    })

    expect(violationCodes(layout)).toEqual([
      'missing-surface',
      'bad-active-surface-id',
      'active-surface-not-in-active-window',
    ])
  })

  it('reports duplicate visible surface references', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const duplicateSurfaceId = layout.rail.visibleSingletonSurfaceIds[0]
    const nextLayout = updateWindow(layout, CLASSIC_EDITOR_WINDOW_ID, {
      surfaceIds:
        layout.windowsById[CLASSIC_EDITOR_WINDOW_ID].surfaceIds.concat(duplicateSurfaceId),
    })

    expect(violationCodes(nextLayout)).toContain('duplicate-visible-surface')
  })

  it('reports bad active IDs and active surface window mismatches', () => {
    const missingWindowId = workbenchWindowId('missing')
    const mismatchedSurfaceId =
      createClassicFirstRunWorkspaceLayout().rail.visibleSingletonSurfaceIds[0]
    const layout = {
      ...createClassicFirstRunWorkspaceLayout(),
      activeSurfaceId: mismatchedSurfaceId,
      activeWindowId: missingWindowId,
    }

    expect(violationCodes(layout)).toEqual(['bad-active-window-id'])

    const mismatchedLayout = {
      ...createClassicFirstRunWorkspaceLayout(),
      activeSurfaceId: mismatchedSurfaceId,
    }

    expect(violationCodes(mismatchedLayout)).toContain('active-surface-not-in-active-window')
  })

  it('reports invalid split sizes and same-axis split chains', () => {
    const layout = updateNode(
      createClassicFirstRunWorkspaceLayout(),
      CLASSIC_MAIN_NODE_ID,
      (node) => ({
        ...node,
        axis: 'horizontal',
        sizes: [1],
      }),
    )

    expect(violationCodes(layout)).toEqual(['invalid-split-size-count', 'same-axis-split-chain'])
  })

  it('reports visible minimized surfaces', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const visibleSurfaceId = layout.rail.visibleSingletonSurfaceIds[0]
    const nextLayout = {
      ...layout,
      rail: {
        ...layout.rail,
        minimizedSurfaceIds: [visibleSurfaceId],
      },
    }

    expect(violationCodes(nextLayout)).toContain('minimized-surface-visible')
  })

  it('reports orphan transient preview owners', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const orphan = createSearchPreviewSurface({
      ownerContextKey: 'result:/repo/src/app.ts:1',
      ownerSurfaceId: fileEditorSurfaceId('/repo/missing-owner.ts'),
    })
    const nextLayout = addSurfaceToWindow(layout, orphan, CLASSIC_EDITOR_WINDOW_ID)

    expect(violationCodes(nextLayout)).toContain('orphan-transient-preview-owner')
  })

  it('reports a missing root node', () => {
    const layout = {
      ...createClassicFirstRunWorkspaceLayout(),
      rootNodeId: layoutNodeId('missing-root'),
    }

    expect(violationCodes(layout)).toEqual(['missing-root-node'])
  })
})

function violationCodes(layout: WorkspaceLayout): LayoutInvariantViolationCode[] {
  return checkWorkspaceLayoutInvariants(layout).violations.map((violation) => violation.code)
}

function updateWindow(
  layout: WorkspaceLayout,
  windowId: keyof WorkspaceLayout['windowsById'],
  patch: Partial<WorkbenchWindow>,
): WorkspaceLayout {
  const window = layout.windowsById[windowId]

  return {
    ...layout,
    windowsById: {
      ...layout.windowsById,
      [windowId]: {
        ...window,
        ...patch,
      },
    },
  }
}

function updateNode(
  layout: WorkspaceLayout,
  nodeId: typeof CLASSIC_ROOT_NODE_ID | typeof CLASSIC_MAIN_NODE_ID,
  update: (node: Extract<LayoutNode, { readonly kind: 'split' }>) => LayoutNode,
): WorkspaceLayout {
  const node = layout.nodesById[nodeId]
  if (node.kind !== 'split') return layout

  return {
    ...layout,
    nodesById: {
      ...layout.nodesById,
      [nodeId]: update(node),
    },
  }
}

function addSurfaceToWindow(
  layout: WorkspaceLayout,
  surface: Surface,
  windowId: keyof WorkspaceLayout['windowsById'],
) {
  const window = layout.windowsById[windowId]

  return {
    ...layout,
    surfacesById: {
      ...layout.surfacesById,
      [surface.id]: surface,
    },
    windowsById: {
      ...layout.windowsById,
      [windowId]: {
        ...window,
        surfaceIds: window.surfaceIds.concat(surface.id),
      },
    },
  }
}
