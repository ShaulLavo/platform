import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useEditorCommands } from '@/features/editor/state/commands'
import { useOptionalWorkspaceEditService } from '@/features/editor/providers/workspace-edit-context'
import { useEditorWorkspaceStoreApi } from '@/features/editor/state/workspace-state'
import { openWorkspaceRootForOwner } from '@/features/workspace/state/open-root'
export type { OpenWorkspaceRootResult } from '@/features/workspace/state/open-root'

export function useOpenWorkspaceRoot() {
  const { switchRootFolder } = useEditorCommands()
  const queryClient = useQueryClient()
  const workspaceStore = useEditorWorkspaceStoreApi()
  const workspaceEdits = useOptionalWorkspaceEditService()

  // Callers retain this opener across awaits; all services belong to its environment.
  return useCallback(
    (rootPath: string) =>
      openWorkspaceRootForOwner(
        { queryClient, switchRootFolder, workspaceStore, workspaceEdits },
        rootPath,
      ),
    [queryClient, switchRootFolder, workspaceEdits, workspaceStore],
  )
}
