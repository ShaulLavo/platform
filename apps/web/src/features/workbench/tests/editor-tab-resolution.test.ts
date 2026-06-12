import { describe, expect, it } from 'vitest'

import { editorWorkspaceLayoutForPaths } from '../../../../test/factories/editor-workspace-layout'
import { editorSurfaceSerializedState } from '@/features/workbench/utils/editor-surface-layout'
import { resolveEditorSurfaceIdForTabId } from '@/features/workbench/utils/editor-tab-resolution'
import { fileEditorSurfaceId } from '@workspace/tiling/utils/layout-ids'
import type { WorkspaceLayout } from '@workspace/tiling/utils/layout-types'

describe('editor tab resolution', () => {
  it('resolves a unique tab id to its surface', () => {
    const layout = editorWorkspaceLayoutForPaths(
      ['/repo/src/a.ts', '/repo/src/b.ts'],
      '/repo/src/a.ts',
    )

    expect(resolveEditorSurfaceIdForTabId(layout, 'test-tab:main:1')).toBe(
      fileEditorSurfaceId('/repo/src/b.ts'),
    )
  })

  it('returns null for an unknown tab id', () => {
    const layout = editorWorkspaceLayoutForPaths(['/repo/src/a.ts'], '/repo/src/a.ts')

    expect(resolveEditorSurfaceIdForTabId(layout, 'test-tab:main:404')).toBeNull()
  })

  it('falls back to the first match when tab ids collide', () => {
    const layout = withCollidingTabIds(
      editorWorkspaceLayoutForPaths(['/repo/src/a.ts', '/repo/src/b.ts'], '/repo/src/a.ts'),
      'test-tab:main:0',
    )

    expect(resolveEditorSurfaceIdForTabId(layout, 'test-tab:main:0')).toBe(
      fileEditorSurfaceId('/repo/src/a.ts'),
    )
  })
})

function withCollidingTabIds(layout: WorkspaceLayout, tabId: string): WorkspaceLayout {
  const surfacesById = Object.fromEntries(
    Object.entries(layout.surfacesById).map(([surfaceId, surface]) => {
      const state = editorSurfaceSerializedState(surface)
      if (!state) return [surfaceId, surface]

      return [surfaceId, { ...surface, serializedState: { ...state, editorTabId: tabId } }]
    }),
  )

  return { ...layout, surfacesById }
}
