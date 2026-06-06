import { useLayoutEffect, useRef, useState } from 'react'

import type { RequestCloseTab } from '@/features/editor/hooks/use-dirty-tab-close'
import {
  useEditorWorkspaceState,
  useEditorWorkspaceStoreApi,
} from '@/features/editor/state/editor-workspace-state'

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
  const workspaceLayout = useEditorWorkspaceState((state) => state.workspaceLayout)
  const dispatchContextRef = useRef<EditorSurfaceDispatchContext | null>(null)
  const [store] = useState(() => {
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

  dispatchContextRef.current = {
    commitLayout: (layout) => workspaceStore.getState().setWorkspaceLayout(layout),
    requestCloseTab,
    store,
  }

  useLayoutEffect(() => {
    store.getState().replaceLayout(workspaceLayout)
  }, [store, workspaceLayout])

  return store
}
