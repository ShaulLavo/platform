import {
  EMPTY_GIT_FILES,
  editorTabModel,
} from '@/components/workspace/editor-tabs/utils/editor-tab-model'
import type { RequestCloseTab, RequestCloseTabs } from '@/features/editor/hooks/use-dirty-tab-close'
import { useEditorConflictState } from '@/features/editor/state/editor-conflict-state'
import { createGitStore } from '@/features/git/state'
import { useStatus } from '@/features/git/hooks'
import type { TreeEntry } from '@/lib/file-system-types'
import type { LoadState } from '@/lib/load-state'
import type { DirectoryLoadOptions, TreeModel } from '@/lib/tree-model'
import type { EditorKeymapLayer } from '@editor/core'
import { useState } from 'react'

import { LayoutProvider } from '@/features/workbench/providers/layout-provider'
import { LayoutRenderer } from '@/features/workbench/components/layout-renderer'
import { editorSurfaceSerializedState } from '@/features/workbench/utils/editor-surface-layout'
import { useEditorSurfaceStore } from '@/features/workbench/hooks/use-editor-surface-store'
import { EditorSurfaceProvider } from '@/features/workbench/providers/editor-surface-provider'
import { editorSurfaceRendererRegistry } from '@/features/workbench/utils/editor-surface-renderers'
import type { Surface } from '@/features/tiling-surface-manager/engine/layout-types'

export function EditorSurfaceLayoutView({
  editorKeymapLayers,
  onLoadDirectory,
  onPrefetchDirectory,
  rootPath,
  treeState,
  onRequestCloseTab,
  onRequestCloseTabs,
}: {
  readonly editorKeymapLayers: readonly EditorKeymapLayer[]
  readonly treeState: LoadState<TreeModel>
  readonly rootPath: string
  readonly onLoadDirectory: (
    entry: TreeEntry,
    treePath: string,
    options?: DirectoryLoadOptions,
  ) => void
  readonly onPrefetchDirectory: (entry: TreeEntry, treePath: string) => void
  readonly onRequestCloseTab: RequestCloseTab
  readonly onRequestCloseTabs: RequestCloseTabs
}) {
  const store = useEditorSurfaceStore({
    requestCloseTab: onRequestCloseTab,
  })
  const [gitStore] = useState(createGitStore)
  const conflicts = useEditorConflictState((state) => state.conflicts)
  const gitStatus = useStatus(rootPath)
  const gitFiles = gitStatus.data?.files ?? EMPTY_GIT_FILES
  const [visibleTreeItemCount, setVisibleTreeItemCount] = useState<{
    readonly count: number
    readonly rootPath: string
  } | null>(null)
  const currentVisibleTreeItemCount =
    visibleTreeItemCount?.rootPath === rootPath ? visibleTreeItemCount.count : null

  function handleVisibleTreeItemCountChange(count: number) {
    setVisibleTreeItemCount((current) => {
      if (current?.count === count && current.rootPath === rootPath) return current

      return { count, rootPath }
    })
  }

  return (
    <EditorSurfaceProvider
      editorKeymapLayers={editorKeymapLayers}
      gitStore={gitStore}
      requestCloseTab={onRequestCloseTab}
      requestCloseTabs={onRequestCloseTabs}
      rootPath={rootPath}
      surfaceIdForEditorTabId={(tabId) => {
        const surface = Object.values(store.getState().layout.surfacesById).find(
          (surface) => editorSurfaceSerializedState(surface)?.editorTabId === tabId,
        )

        return surface?.id ?? null
      }}
      tabModelForSurface={(surface, active) =>
        editorTabModelForSurface(surface, {
          active,
          conflicts,
          gitFiles,
          rootPath,
        })
      }
      toolSurfaceState={{
        treeState,
        visibleTreeItemCount: currentVisibleTreeItemCount,
        onLoadDirectory,
        onPrefetchDirectory,
        onVisibleTreeItemCountChange: handleVisibleTreeItemCountChange,
      }}
    >
      <LayoutProvider store={store}>
        <LayoutRenderer surfaceRenderers={editorSurfaceRendererRegistry} />
      </LayoutProvider>
    </EditorSurfaceProvider>
  )
}

function editorTabModelForSurface(
  surface: Surface,
  {
    active,
    conflicts,
    gitFiles,
    rootPath,
  }: {
    readonly active: boolean
    readonly conflicts: Parameters<typeof editorTabModel>[0]['conflicts']
    readonly gitFiles: Parameters<typeof editorTabModel>[0]['gitFiles']
    readonly rootPath: string
  },
) {
  const editorState = editorSurfaceSerializedState(surface)
  if (!editorState) return null
  if (!surface.resourceKey) return null

  return editorTabModel({
    conflicts,
    gitFiles,
    rootPath,
    selectedTabId: active ? editorState.editorTabId : null,
    tab: {
      id: editorState.editorTabId,
      path: surface.resourceKey,
    },
  })
}
