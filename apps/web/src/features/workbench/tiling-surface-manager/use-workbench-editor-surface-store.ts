import { useLayoutEffect, useRef, useState } from 'react'

import type { RequestCloseTab } from '@/features/editor/hooks/use-dirty-tab-close'
import { useEditorCommands } from '@/features/editor/state/editor-commands'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'

import { createWorkspaceLayoutStore } from './surface-state'
import {
  dispatchWorkbenchEditorSurfaceOperation,
  type WorkbenchEditorSurfaceDispatchContext,
} from './workbench-editor-surface-dispatch'
import { workspaceLayoutForEditorPaneLayout } from './workbench-editor-surface-layout'

export function useWorkbenchEditorSurfaceStore({
  requestCloseTab,
}: {
  readonly requestCloseTab: RequestCloseTab
}) {
  const editorPaneLayout = useEditorWorkspaceState((state) => state.editorPaneLayout)
  const commands = useEditorCommands()
  const dispatchContextRef = useRef<WorkbenchEditorSurfaceDispatchContext | null>(null)
  const [store] = useState(() => {
    const layoutStore = createWorkspaceLayoutStore(
      workspaceLayoutForEditorPaneLayout(editorPaneLayout),
    )

    layoutStore.setState({
      dispatchLayoutOperation: (operation) => {
        const context = dispatchContextRef.current
        if (!context) {
          layoutStore.getState().replaceLayout(layoutStore.getState().layout)
          return
        }

        dispatchWorkbenchEditorSurfaceOperation(operation, context)
      },
    })

    return layoutStore
  })

  dispatchContextRef.current = {
    commands,
    requestCloseTab,
    store,
  }

  useLayoutEffect(() => {
    store.getState().replaceLayout(workspaceLayoutForEditorPaneLayout(editorPaneLayout))
  }, [editorPaneLayout, store])

  return store
}
