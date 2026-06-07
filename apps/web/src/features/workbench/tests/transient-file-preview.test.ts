import { describe, expect, it } from 'vitest'
import type { LanguageServerDefinitionTarget } from '@editor/lsp-plugin'

import { createEditorUiStore } from '@/features/editor/state/editor-ui-state'
import {
  createClassicFirstRunWorkspaceLayout,
  createFileEditorSurface,
} from '@/features/tiling-surface-manager/engine/layout-builders'
import { openSurface } from '@/features/tiling-surface-manager/engine/layout-operations'
import { createWorkspaceLayoutStore } from '@/features/tiling-surface-manager/engine/surface-state'
import { openTransientFilePreview } from '@/features/workbench/utils/transient-file-preview'

describe('transient file previews', () => {
  it('opens a transient file editor for unopened preview targets', () => {
    const layoutStore = createWorkspaceLayoutStore(createClassicFirstRunWorkspaceLayout())
    const uiStore = createEditorUiStore()
    const target = definitionTarget('/repo/src/preview.ts')

    openTransientFilePreview({ layoutStore, target, uiStore })

    const surface = Object.values(layoutStore.getState().layout.surfacesById).find(
      (candidate) => candidate.resourceKey === target.path,
    )
    expect(surface).toMatchObject({
      lifecycle: 'transient',
      resourceKey: target.path,
      type: 'file-editor',
    })
    expect(uiStore.getState().definitionTarget).toBe(target)
  })

  it('activates an existing durable file editor without demoting it', () => {
    const durableSurface = createFileEditorSurface({ path: '/repo/src/open.ts' })
    const layout = openSurface(createClassicFirstRunWorkspaceLayout(), durableSurface)
    const layoutStore = createWorkspaceLayoutStore(layout)
    const uiStore = createEditorUiStore()
    const target = definitionTarget('/repo/src/open.ts')

    openTransientFilePreview({ layoutStore, target, uiStore })

    expect(layoutStore.getState().layout.surfacesById[durableSurface.id]).toMatchObject({
      lifecycle: 'durable',
      resourceKey: target.path,
      type: 'file-editor',
    })
    expect(layoutStore.getState().layout.activeSurfaceId).toBe(durableSurface.id)
    expect(uiStore.getState().definitionTarget).toBe(target)
  })
})

function definitionTarget(path: string): LanguageServerDefinitionTarget {
  return {
    path,
    range: {
      end: { character: 1, line: 1 },
      start: { character: 0, line: 1 },
    },
    uri: `file://${path}`,
  }
}
