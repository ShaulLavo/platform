import { useLayoutEffect, useRef, useState } from 'react'

import type { RequestCloseTab } from '@/features/editor/hooks/use-dirty-tab-close'
import { useEditorWorkspaceStoreApi } from '@/features/editor/state/editor-workspace-state'

import { createWorkspaceLayoutStore } from '@/features/tiling-surface-manager/engine/surface-state'
import {
  dispatchEditorSurfaceOperation,
  type EditorSurfaceDispatchContext,
} from '@/features/workbench/utils/editor-surface-dispatch'

export function useEditorSurfaceStore({
  requestCloseTab,
}: {
  readonly requestCloseTab: RequestCloseTab
}) {
  const workspaceStore = useEditorWorkspaceStoreApi()
  const dispatchContextRef = useRef<EditorSurfaceDispatchContext | null>(null)
  const [store] = useState(() => {
    const workspaceLayout = workspaceStore.getState().workspaceLayout
    const layoutStore = createWorkspaceLayoutStore(workspaceLayout)

    layoutStore.setState({
      dispatchLayoutOperation: (operation) => {
        const context = dispatchContextRef.current
        if (!context) {
          layoutStore.getState().replaceLayout(layoutStore.getState().layout)
          return
        }

        dispatchEditorSurfaceOperation(operation, context)
      },
    })

    return layoutStore
  })

  useLayoutEffect(() => {
    let syncedLayout = store.getState().layout

    function syncWorkspaceLayout() {
      const workspaceLayout = workspaceStore.getState().workspaceLayout
      if (syncedLayout === workspaceLayout) return

      syncedLayout = workspaceLayout
      store.getState().replaceLayout(workspaceLayout)
    }

    syncWorkspaceLayout()

    return workspaceStore.subscribe((state, previousState) => {
      if (state.workspaceLayout === previousState.workspaceLayout) return

      syncWorkspaceLayout()
    })
  }, [store, workspaceStore])

  dispatchContextRef.current = {
    commitLayout: (layout) => workspaceStore.getState().setWorkspaceLayout(layout),
    requestCloseTab,
    store,
  }

  return store
}
