import { useCallback } from 'react'

import { workspaceProjectId } from '@/features/chat/lib/chat-command-builders'
import { useSessionSelectionStore } from '@/features/chat-mode/state/session-selection-store'
import { useEditorWorkspaceStoreApi } from '@/features/editor/state/editor-workspace-state'
import { useOpenWorkspaceRoot } from '@/hooks/use-open-workspace-root'

/**
 * Opening a project from the session rail, plus the selection bookkeeping the rail
 * needs: a pick aimed at a project that never opens must not decay into showing the
 * open project's newest thread.
 */
export function useOpenProject() {
  const openWorkspaceRoot = useOpenWorkspaceRoot()
  const workspaceStore = useEditorWorkspaceStoreApi()

  return useCallback(
    (workspaceRoot: string) => {
      if (workspaceStore.getState().rootFolder?.path === workspaceRoot) return

      const { abandonProjectSwitch, beginProjectSwitch, isCurrentSwitch, settleProjectSwitch } =
        useSessionSelectionStore.getState()
      const token = beginProjectSwitch(workspaceRoot)

      void openWorkspaceRoot(workspaceRoot, { isCurrent: () => isCurrentSwitch(token) }).then(
        (result) => {
          if (!isCurrentSwitch(token)) return
          if (result === 'opened') {
            settleProjectSwitch()
            return
          }

          abandonProjectSwitch(workspaceProjectId(workspaceRoot), currentProjectId(workspaceStore))
        },
      )
    },
    [openWorkspaceRoot, workspaceStore],
  )
}

function currentProjectId(workspaceStore: ReturnType<typeof useEditorWorkspaceStoreApi>) {
  const rootPath = workspaceStore.getState().rootFolder?.path
  if (!rootPath) return null

  return workspaceProjectId(rootPath)
}
