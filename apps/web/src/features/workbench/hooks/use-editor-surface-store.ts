import { useEffectEvent, useLayoutEffect, useState } from 'react'

import type { RequestCloseTab } from '@/features/editor/hooks/use-dirty-tab-close'
import { useEditorWorkspaceStoreApi } from '@/features/editor/state/editor-workspace-state'

import {
  createWorkspaceLayoutStore,
  type WorkspaceLayoutStoreApi,
} from '@/features/tiling-surface-manager/engine/surface-state'
import { dispatchEditorSurfaceOperation } from '@/features/workbench/utils/editor-surface-dispatch'
import type { LayoutOperation } from '@workspace/tiling/utils/layout-types'

export function useEditorSurfaceStore({
  requestCloseTab,
}: {
  readonly requestCloseTab: RequestCloseTab
}) {
  const workspaceStore = useEditorWorkspaceStoreApi()

  const dispatchOperation = useEffectEvent(
    (operation: LayoutOperation, layoutStore: WorkspaceLayoutStoreApi) => {
      dispatchEditorSurfaceOperation(operation, {
        commitLayout: (layout) => workspaceStore.getState().setWorkspaceLayout(layout),
        requestCloseTab,
        store: layoutStore,
      })
    },
  )

  const [store] = useState(() => {
    const workspaceLayout = workspaceStore.getState().workspaceLayout
    const layoutStore = createWorkspaceLayoutStore(workspaceLayout)

    layoutStore.setState({
      dispatchLayoutOperation: (operation) => dispatchOperation(operation, layoutStore),
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

  return store
}
