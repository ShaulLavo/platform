import { describe, expect, it } from 'vitest'

import { createFileEditorSurface } from '@/features/tiling-surface-manager/engine/layout-builders'
import {
  layoutSnapshot,
  operationSummary,
} from '@/features/tiling-surface-manager/engine/layout-logging'
import { createWorkbenchWindow } from '@/features/tiling-surface-manager/engine/layout-builders'
import {
  CLASSIC_RECIPE_ID,
  layoutNodeId,
  workbenchWindowId,
} from '@/features/tiling-surface-manager/engine/layout-ids'
import type { WorkspaceLayout } from '@/features/tiling-surface-manager/engine/layout-types'

describe('layout logging', () => {
  it('summarizes layout snapshots without raw id arrays or file paths', () => {
    const layout = layoutWithFileEditor('/Users/shaul/Desktop/D/platform/src/app.ts')
    const snapshot = layoutSnapshot(layout)

    expect(snapshot).toMatchObject({
      activeSurface: {
        id: 'surface:file-editor:.../src/app.ts',
        type: 'file-editor',
      },
      backgroundSurfaceCount: 0,
      nodeCount: 1,
      visibleSurfaceCount: 1,
      visibleWindowCount: 1,
      windowCount: 1,
    })
    expect(snapshot).not.toHaveProperty('visibleSurfaceIds')
    expect(snapshot).not.toHaveProperty('visibleWindowIds')
  })

  it('compacts operation ids so encoded paths do not dominate log lines', () => {
    const file = createFileEditorSurface({
      path: '/Users/shaul/Desktop/D/platform/src/very-long-file-name.ts',
    })

    expect(operationSummary({ surfaceId: file.id, type: 'closeSurface' })).toEqual({
      operationType: 'closeSurface',
      surfaceId: 'surface:file-editor:.../src/very-long-file-name.ts',
    })
  })
})

function layoutWithFileEditor(path: string): WorkspaceLayout {
  const file = createFileEditorSurface({ path })
  const window = createWorkbenchWindow({
    activeSurfaceId: file.id,
    id: workbenchWindowId('surface:file-editor'),
    surfaceIds: [file.id],
  })
  const nodeId = layoutNodeId('file-editor')

  return {
    activeRecipeId: CLASSIC_RECIPE_ID,
    activeSurfaceId: file.id,
    activeWindowId: window.id,
    hotkeyPresetsById: {},
    layoutCommandsById: {},
    mruSurfaceIds: [file.id],
    mruWindowIds: [window.id],
    nodesById: {
      [nodeId]: {
        id: nodeId,
        kind: 'window',
        windowId: window.id,
      },
    },
    policiesById: {},
    rail: {
      backgroundSurfaceIds: [],
      pinnedSurfaceIds: [],
      recipeIds: [],
      runningSurfaceIds: [],
      visibleSingletonSurfaceIds: [],
    },
    recipesById: {},
    rootNodeId: nodeId,
    surfaceRegistryVersion: 1,
    surfacesById: {
      [file.id]: file,
    },
    version: 1,
    windowCommandsById: {},
    windowsById: {
      [window.id]: window,
    },
  }
}
