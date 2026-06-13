import type { LanguageServerDefinitionTarget } from '@singapor/lsp-plugin'

import type { EditorUiStoreApi } from '@/features/editor/state/editor-ui-state'
import { createFileEditorSurface } from '@workspace/tiling/utils/layout-builders'
import { fileEditorPreviewSurfaceId } from '@workspace/tiling/utils/layout-ids'
import { PREVIEW_ADJACENT_POLICY_ID } from '@workspace/tiling/utils/layout-policies'
import type { SurfaceId, WorkspaceLayout } from '@workspace/tiling/utils/layout-types'
import type { WorkspaceLayoutStoreApi } from '@/features/tiling-surface-manager/engine/surface-state'

export function openTransientFilePreview({
  layoutStore,
  ownerSurfaceId,
  target,
  uiStore,
}: {
  readonly layoutStore: WorkspaceLayoutStoreApi
  readonly ownerSurfaceId?: SurfaceId
  readonly target: LanguageServerDefinitionTarget
  readonly uiStore: EditorUiStoreApi
}) {
  const existingSurfaceId = durableFileSurfaceIdForPath(layoutStore.getState().layout, target.path)
  if (existingSurfaceId) {
    layoutStore.getState().dispatchLayoutOperation({
      surfaceId: existingSurfaceId,
      type: 'activateSurface',
    })
    uiStore.getState().setDefinitionTarget(target)
    return
  }

  layoutStore.getState().dispatchLayoutOperation({
    policyId: PREVIEW_ADJACENT_POLICY_ID,
    surface: transientFilePreviewSurfaceForTarget({ ownerSurfaceId, target }),
    type: 'openSurface',
  })
  uiStore.getState().setDefinitionTarget(target)
}

function durableFileSurfaceIdForPath(layout: WorkspaceLayout, path: string) {
  for (const surface of Object.values(layout.surfacesById)) {
    if (surface.type !== 'file-editor') continue
    if (surface.lifecycle === 'transient') continue
    if (surface.resourceKey !== path) continue

    return surface.id
  }
}

function previewOwnerContextKey(target: LanguageServerDefinitionTarget) {
  return `${target.path}:${target.range.start.line}:${target.range.start.character}`
}

export function transientFilePreviewSurfaceForTarget({
  ownerContextKey,
  ownerSurfaceId,
  target,
}: {
  readonly ownerContextKey?: string
  readonly ownerSurfaceId?: SurfaceId
  readonly target: LanguageServerDefinitionTarget
}) {
  const contextKey = ownerContextKey ?? previewOwnerContextKey(target)
  const surface = createFileEditorSurface({ lifecycle: 'transient', path: target.path })
  const previewSurface = {
    ...surface,
    serializedState: {
      definitionTarget: target,
      editorGroupId: 'workbench:preview',
      editorTabId: `editor-tab:preview:${contextKey}`,
    },
  }
  if (!ownerSurfaceId) return previewSurface

  return {
    ...previewSurface,
    id: fileEditorPreviewSurfaceId(ownerSurfaceId, contextKey),
    ownerContextKey: contextKey,
    ownerSurfaceId,
    stateKey: contextKey,
  }
}
