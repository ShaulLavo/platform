import { describe, expect, it } from 'vitest'

import {
  createEmptyWorkspaceLayout,
  createFileEditorSurface,
} from '@workspace/tiling/utils/layout-builders'
import { checkWorkspaceLayoutInvariants } from '@workspace/tiling/utils/layout-invariants'
import { createWorkspaceLayoutStore } from '@/features/tiling-surface-manager/engine/surface-state'

describe('tiling surface workspace layout store', () => {
  it('creates a normalized empty store and dispatches operations through the pure reducer', () => {
    const store = createWorkspaceLayoutStore(createEmptyWorkspaceLayout(), {
      checkInvariants: true,
    })
    const previousLayout = store.getState().layout
    const previousSurfacesById = previousLayout.surfacesById
    const file = createFileEditorSurface({ path: '/repo/src/store.ts' })

    store.getState().dispatchLayoutOperation({ surface: file, type: 'openSurface' })

    const nextLayout = store.getState().layout
    expect(previousLayout.surfacesById[file.id]).toBeUndefined()
    expect(previousLayout.surfacesById).toBe(previousSurfacesById)
    expect(nextLayout.surfacesById[file.id]).toBeDefined()
    expect(nextLayout).not.toBe(previousLayout)
    expect(checkWorkspaceLayoutInvariants(nextLayout).ok).toBe(true)
  })

  it('replaces and resets layout state without mutating previous objects', () => {
    const file = createFileEditorSurface({ path: '/repo/src/reset.ts' })
    const store = createWorkspaceLayoutStore()
    store.getState().dispatchLayoutOperation({ surface: file, type: 'openSurface' })

    const openedLayout = store.getState().layout
    store.getState().resetLayout()

    const resetLayout = store.getState().layout
    expect(openedLayout.surfacesById[file.id]).toBeDefined()
    expect(resetLayout.surfacesById[file.id]).toBeUndefined()
    expect(resetLayout.rootNodeId).toBeNull()
  })
})
