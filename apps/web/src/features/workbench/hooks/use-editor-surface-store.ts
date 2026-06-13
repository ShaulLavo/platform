/* eslint-disable oxc-react-compiler/refs -- DEFERRED (see handoff): dispatchContextRef is written during render and read inside the useState initializer, so the React Compiler bails on this hook (not memoized). Fix = eliminate the ref entirely. */
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
  // TODO(react-compiler, see handoff): lint passes, but the compiler still bails
  // on this hook ("Cannot access refs during render") because dispatchContextRef
  // is read inside the useState initializer below — so it is NOT memoized.
  // Eliminating the ref (pass layoutStore in + capture closures via useEffectEvent)
  // restores compilation.
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
