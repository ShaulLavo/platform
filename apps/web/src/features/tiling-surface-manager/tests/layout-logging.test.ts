import { afterEach, describe, expect, it, vi } from 'vitest'

const clientLogMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@/lib/client-logging', () => ({
  log: clientLogMock,
}))

import { createFileEditorSurface } from '@/features/tiling-surface-manager/engine/layout-builders'
import {
  flushPendingWorkbenchLayoutInfoLogs,
  layoutSnapshot,
  logWorkbenchLayoutInfo,
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
  afterEach(() => {
    flushPendingWorkbenchLayoutInfoLogs()
    clientLogMock.info.mockClear()
    clientLogMock.warn.mockClear()
    vi.useRealTimers()
  })

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

  it('coalesces successful resize dispatch info logs', () => {
    vi.useFakeTimers()

    logWorkbenchLayoutInfo('layout.operation.dispatch', {
      before: { windowCount: 1 },
      operation: {
        deltaPx: 8,
        handleIndex: 0,
        operationType: 'resizeSplit',
        splitId: 'node:split-main',
      },
      outcome: 'ok',
      result: { windowCount: 1 },
    })
    logWorkbenchLayoutInfo('layout.operation.dispatch', {
      before: { windowCount: 1 },
      operation: {
        deltaPx: 12,
        handleIndex: 0,
        operationType: 'resizeSplit',
        splitId: 'node:split-main',
      },
      outcome: 'ok',
      result: { windowCount: 2 },
    })

    expect(clientLogMock.info).not.toHaveBeenCalled()

    vi.advanceTimersByTime(249)
    expect(clientLogMock.info).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(clientLogMock.info).toHaveBeenCalledOnce()
    expect(clientLogMock.info.mock.calls[0]?.[0]).toMatchObject({
      action: 'layout.operation.dispatch',
      area: 'workbench.layout',
      coalescedCount: 2,
      operation: {
        deltaPx: 12,
        handleIndex: 0,
        operationType: 'resizeSplit',
        splitId: 'node:split-main',
      },
      outcome: 'ok',
      result: { windowCount: 2 },
    })
  })

  it('keeps non-resize dispatch info logs immediate', () => {
    logWorkbenchLayoutInfo('layout.operation.dispatch', {
      operation: {
        operationType: 'closeSurface',
        surfaceId: 'surface:logs',
      },
      outcome: 'ok',
    })

    expect(clientLogMock.info).toHaveBeenCalledOnce()
    expect(clientLogMock.info.mock.calls[0]?.[0]).toMatchObject({
      action: 'layout.operation.dispatch',
      area: 'workbench.layout',
      operation: {
        operationType: 'closeSurface',
        surfaceId: 'surface:logs',
      },
      outcome: 'ok',
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
