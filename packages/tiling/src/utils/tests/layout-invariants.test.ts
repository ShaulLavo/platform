import { describe, expect, it } from 'vitest'

import {
  CLASSIC_EDITOR_WINDOW_ID,
  CLASSIC_MAIN_NODE_ID,
  CLASSIC_ROOT_NODE_ID,
  createClassicFirstRunWorkspaceLayout,
  createSearchPreviewSurface,
} from '@workspace/tiling/utils/layout-builders'
import {
  FOCUS_WINDOW_LEFT_COMMAND_ID,
  FOCUS_WINDOW_RIGHT_COMMAND_ID,
} from '@workspace/tiling/utils/layout-command-catalog'
import { defaultHotkeyPresetsById } from '@workspace/tiling/utils/layout-command-presets'
import {
  checkWorkspaceLayoutInvariants,
  type LayoutInvariantViolationCode,
} from '@workspace/tiling/utils/layout-invariants'
import {
  fileEditorSurfaceId,
  hotkeyPresetId,
  layoutCommandId,
  layoutNodeId,
  recipeId,
  windowManagementCommandId,
  workbenchWindowId,
} from '@workspace/tiling/utils/layout-ids'
import type {
  CustomWindowFrame,
  LayoutNode,
  Surface,
  WorkbenchWindow,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'

describe('tiling surface layout invariants', () => {
  it('accepts the classic first-run builder output', () => {
    expect(checkWorkspaceLayoutInvariants(createClassicFirstRunWorkspaceLayout())).toEqual({
      ok: true,
      violations: [],
    })
  })

  it('accepts bundled hotkey presets', () => {
    const layout = {
      ...createClassicFirstRunWorkspaceLayout(),
      hotkeyPresetsById: defaultHotkeyPresetsById(),
    }

    expect(checkWorkspaceLayoutInvariants(layout)).toEqual({
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
      CLASSIC_ROOT_NODE_ID,
      (node) => ({
        ...node,
        axis: 'vertical',
        sizes: [1],
      }),
    )

    expect(violationCodes(layout)).toEqual(['invalid-split-size-count', 'same-axis-split-chain'])
  })

  it('reports visible background surfaces', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const visibleSurfaceId = layout.rail.visibleSingletonSurfaceIds[0]
    const nextLayout = {
      ...layout,
      rail: {
        ...layout.rail,
        backgroundSurfaceIds: [visibleSurfaceId],
      },
    }

    expect(violationCodes(nextLayout)).toContain('background-surface-visible')
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

  it('reports invalid layout command surface slots', () => {
    const commandId = layoutCommandId('invalid-slot')
    const layout = {
      ...createClassicFirstRunWorkspaceLayout(),
      layoutCommandsById: {
        [commandId]: {
          aliases: [],
          enabled: true,
          icon: 'layout',
          id: commandId,
          slots: [
            {
              frame: frame('center'),
              id: 'unknown',
              surfaceType: 'agent-run',
            },
          ],
          title: 'Invalid Slot',
        },
      },
    } as unknown as WorkspaceLayout

    expect(violationCodes(layout)).toContain('invalid-layout-command-slot-surface-type')
  })

  it('reports saved layout commands that reference missing recipes', () => {
    const commandId = layoutCommandId('invalid-recipe')
    const layout = {
      ...createClassicFirstRunWorkspaceLayout(),
      layoutCommandsById: {
        [commandId]: {
          aliases: [],
          enabled: true,
          icon: 'layout',
          id: commandId,
          recipeId: recipeId('missing-workflow'),
          slots: [
            {
              frame: frame('center'),
              id: 'file',
              surfaceType: 'file-editor',
            },
          ],
          title: 'Invalid Recipe',
        },
      },
    } satisfies WorkspaceLayout

    expect(violationCodes(layout)).toContain('invalid-layout-command-recipe')
  })

  it('reports hotkey presets that reference missing commands', () => {
    const presetId = hotkeyPresetId('bad-preset')
    const missingCommandId = windowManagementCommandId('missing-command')
    const layout = {
      ...createClassicFirstRunWorkspaceLayout(),
      hotkeyPresetsById: {
        [presetId]: {
          bindings: {
            [missingCommandId]: 'Ctrl+Alt+M',
          },
          id: presetId,
          source: 'platform',
          title: 'Bad Preset',
        },
      },
    } satisfies WorkspaceLayout

    expect(violationCodes(layout)).toContain('invalid-hotkey-preset-command')
  })

  it('reports duplicate hotkey bindings inside a preset', () => {
    const presetId = hotkeyPresetId('duplicate-preset')
    const layout = {
      ...createClassicFirstRunWorkspaceLayout(),
      hotkeyPresetsById: {
        [presetId]: {
          bindings: {
            [FOCUS_WINDOW_LEFT_COMMAND_ID]: 'Ctrl+Alt+H',
            [FOCUS_WINDOW_RIGHT_COMMAND_ID]: 'Ctrl+Alt+H',
          },
          id: presetId,
          source: 'platform',
          title: 'Duplicate Preset',
        },
      },
    } satisfies WorkspaceLayout

    expect(violationCodes(layout)).toContain('duplicate-hotkey-binding')
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

function frame(anchor: CustomWindowFrame['anchor']): CustomWindowFrame {
  return {
    anchor,
    height: 50,
    offsetX: 0,
    offsetY: 0,
    unit: 'percent',
    width: 50,
  }
}
