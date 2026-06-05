import { describe, expect, it } from 'bun:test'

import {
  CLASSIC_DIAGNOSTICS_WINDOW_ID,
  CLASSIC_EDITOR_NODE_ID,
  CLASSIC_EDITOR_WINDOW_ID,
  CLASSIC_FILE_NAVIGATOR_WINDOW_ID,
  CLASSIC_MAIN_NODE_ID,
  createClassicFirstRunWorkspaceLayout,
  createFileEditorSurface,
} from './layout-builders'
import {
  CLOSE_ACTIVE_SURFACE_COMMAND_ID,
  MOVE_ACTIVE_SURFACE_TO_RAIL_COMMAND_ID,
  commandMatchesSearch,
} from './layout-command-catalog'
import { layoutCommandId, windowManagementCommandId } from './layout-ids'
import { openSurface } from './layout-operations'
import {
  resolveNodePath,
  resolveSurfacePath,
  selectActiveSurface,
  selectActiveWindow,
  selectCapabilityFilteredCommandTargets,
  selectCommandPaletteRows,
  selectMaterializedLayoutTree,
  selectMruFallback,
  selectWindowNeighborIds,
} from './layout-selectors'
import type {
  CustomWindowFrame,
  CustomWindowManagementCommand,
  WorkspaceLayout,
  WorkspaceLayoutCommand,
} from './layout-types'

describe('tiling surface layout selectors', () => {
  it('materializes the normalized tree and resolves node, window, and surface paths', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const tree = selectMaterializedLayoutTree(layout)
    const activeSurfaceId = layout.activeSurfaceId
    if (!activeSurfaceId) throw new Error('Expected active surface')

    const nodePath = resolveNodePath(layout, CLASSIC_EDITOR_NODE_ID)
    const surfacePath = resolveSurfacePath(layout, activeSurfaceId)

    expect(tree?.kind).toBe('split')
    expect(nodePath).toEqual([layout.rootNodeId, CLASSIC_MAIN_NODE_ID, CLASSIC_EDITOR_NODE_ID])
    expect(surfacePath?.windowId).toBe(CLASSIC_EDITOR_WINDOW_ID)
    expect(surfacePath?.surfaceIndex).toBe(0)
    expect(selectActiveWindow(layout)?.id).toBe(CLASSIC_EDITOR_WINDOW_ID)
    expect(selectActiveSurface(layout)?.id).toBe(activeSurfaceId)
  })

  it('derives structural window neighbors across split ancestors', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const neighbors = selectWindowNeighborIds(layout, CLASSIC_EDITOR_WINDOW_ID)

    expect(neighbors.left).toBe(CLASSIC_FILE_NAVIGATOR_WINDOW_ID)
    expect(neighbors.bottom).toBe(CLASSIC_DIAGNOSTICS_WINDOW_ID)
    expect(neighbors.right).toBeUndefined()
  })

  it('derives MRU fallback and capability-filtered command targets', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const targets = selectCapabilityFilteredCommandTargets(layout)
    const fallback = selectMruFallback(layout)

    expect(targets.activeWindow?.id).toBe(CLASSIC_EDITOR_WINDOW_ID)
    expect(targets.closableSurfaceIds).not.toContain(layout.activeSurfaceId)
    expect(targets.minimizableSurfaceIds).not.toContain(layout.activeSurfaceId)
    expect(targets.movableWindowIds).toContain(CLASSIC_EDITOR_WINDOW_ID)
    expect(fallback.surface?.id).toBe(layout.activeSurfaceId)
    expect(fallback.window?.id).toBe(CLASSIC_EDITOR_WINDOW_ID)
  })

  it('derives command palette rows for built-in, custom, and saved layout commands', () => {
    const customCommand = customWindowCommand()
    const savedLayoutCommand = savedCommand()
    const layout = {
      ...createClassicFirstRunWorkspaceLayout(),
      layoutCommandsById: {
        [savedLayoutCommand.id]: savedLayoutCommand,
      },
      windowCommandsById: {
        [customCommand.id]: customCommand,
      },
    } satisfies WorkspaceLayout
    const rows = selectCommandPaletteRows(layout)

    const closeRow = rows.find((row) => row.id === CLOSE_ACTIVE_SURFACE_COMMAND_ID)
    const moveToRailRow = rows.find((row) => row.id === MOVE_ACTIVE_SURFACE_TO_RAIL_COMMAND_ID)
    const customRow = rows.find((row) => row.id === customCommand.id)
    const savedRow = rows.find((row) => row.id === savedLayoutCommand.id)

    expect(closeRow?.disabledReason).toBe('Active surface cannot be closed.')
    expect(moveToRailRow?.disabledReason).toBe('Active surface cannot be minimized.')
    expect(customRow?.kind).toBe('custom-window')
    expect(customRow?.disabledReason).toBe('Command is disabled.')
    expect(savedRow?.kind).toBe('saved-layout')
    expect(savedRow?.searchableText).toContain('review layout')
  })

  it('keeps command alias matching independent from command palette rows', () => {
    const file = createFileEditorSurface({ path: '/repo/src/selectors.ts' })
    const layout = openSurface(createClassicFirstRunWorkspaceLayout(), file)
    const rows = selectCommandPaletteRows(layout)
    const maximizeRow = rows.find((row) => row.title === 'Maximize Active Window')
    if (!maximizeRow || maximizeRow.kind === 'saved-layout') {
      throw new Error('Expected built-in maximize command row')
    }

    expect(commandMatchesSearch(maximizeRow.command, 'fullscreen')).toBe(true)
    expect(maximizeRow.disabledReason).toBeNull()
  })
})

function customWindowCommand(): CustomWindowManagementCommand {
  return {
    aliases: ['custom half'],
    category: 'Window Management',
    enabled: false,
    icon: 'panel-left',
    id: windowManagementCommandId('custom-left-half'),
    kind: 'custom-window',
    targetFrame: frame('left'),
    title: 'Custom Left Half',
  }
}

function savedCommand(): WorkspaceLayoutCommand {
  return {
    aliases: ['review layout'],
    enabled: true,
    icon: 'layout',
    id: layoutCommandId('review'),
    slots: [
      {
        frame: frame('center'),
        id: 'review-file',
        resourceKey: '/repo/src/review.ts',
        surfaceType: 'file-editor',
      },
    ],
    title: 'Review Layout',
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
