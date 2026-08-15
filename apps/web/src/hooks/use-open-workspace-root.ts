import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { isDirectoryEntry } from '@workspace/contracts'
import { useCallback } from 'react'

import { workspacePathLeaf } from '@/features/address/utils/workspace-path'
import { useEditorCommands } from '@/features/editor/state/editor-commands'
import { useEditorWorkspaceStoreApi } from '@/features/editor/state/editor-workspace-state'
import { useResetWorkspaceTreeLoad } from '@/hooks/use-workspace-tree'
import { reportError, toClientError } from '@/lib/client-error-taxonomy'
import { log } from '@/lib/client-logging'
import { recordRecentEntry, statPath } from '@/lib/file-server'
import { filePickerKeys } from '@/lib/query-keys'
import { recentFolderKeys } from '@/lib/recent-folders-query'
import { activateWorkspaceRoot, isActiveWorkspaceRoot } from '@/state/active-project-store'

export type OpenWorkspaceRootResult = 'already-open' | 'failed' | 'opened' | 'superseded'

/**
 * Opens a workspace root by path. Projects are known by path — from a chat session,
 * from the project menu — but the workspace wants a picked entry, so the path is
 * resolved against the file server first.
 *
 * Activation is synchronous and the editor catches up: chat re-points on this frame
 * while the stat is still in flight, and an open that finishes after a newer one has
 * been requested drops itself rather than dragging the editor backwards.
 *
 * App-level on purpose: the titlebar's project menu and the chat rail both switch
 * projects, and neither should have to reach into the other's feature. Being the one
 * chokepoint, this is also where an open counts as recent — recording it in the
 * picker alone left the recents frozen at the last time the picker was used.
 */
export function useOpenWorkspaceRoot() {
  const { switchRootFolder } = useEditorCommands()
  const queryClient = useQueryClient()
  const resetTreeLoad = useResetWorkspaceTreeLoad()
  const workspaceStore = useEditorWorkspaceStoreApi()

  return useCallback(
    async (workspaceRoot: string): Promise<OpenWorkspaceRootResult> => {
      activateWorkspaceRoot(workspaceRoot)
      if (workspaceStore.getState().rootFolder?.path === workspaceRoot) return 'already-open'

      const controller = new AbortController()
      try {
        const entry = await statPath(workspaceRoot, controller.signal)
        // A later request already claimed the app; landing now would drag it back.
        if (!isActiveWorkspaceRoot(workspaceRoot)) {
          log.info({
            action: 'workspace.root_open_superseded',
            area: 'workspace',
            path: workspaceRoot,
          })
          return 'superseded'
        }
        if (!isDirectoryEntry(entry)) {
          log.warn({
            action: 'workspace.root_open_rejected',
            area: 'workspace',
            entryType: entry.type,
            path: workspaceRoot,
          })
          return 'failed'
        }

        resetTreeLoad()
        switchRootFolder({ ...entry, name: workspacePathLeaf(workspaceRoot), type: 'directory' })
        log.info({ action: 'workspace.root_opened', area: 'workspace', path: workspaceRoot })
        void recordRootAsRecent(queryClient, workspaceRoot)
        return 'opened'
      } catch (error) {
        reportError(toClientError(error))
        return 'failed'
      }
    },
    [queryClient, resetTreeLoad, switchRootFolder, workspaceStore],
  )
}

/** Trails the open: a lost recency stamp is a worse menu, never a failed switch. */
async function recordRootAsRecent(queryClient: QueryClient, workspaceRoot: string) {
  try {
    await recordRecentEntry(workspaceRoot)
  } catch {
    // Swallowed, not silent: the fs.record_recent wide event carries the failure.
    return
  }

  // Both the titlebar menu and the picker sidebar read this list.
  await queryClient.invalidateQueries({ queryKey: recentFolderKeys.all })
  await queryClient.invalidateQueries({ queryKey: filePickerKeys.recents() })
}
