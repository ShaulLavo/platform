import { isDirectoryEntry } from '@workspace/contracts'
import { useCallback } from 'react'

import { confirmDiscardingUnsavedWork } from '@/features/chat-mode/utils/unsaved-work'
import { useEditorCommands } from '@/features/editor/state/editor-commands'
import { useEditorDocumentStoreApi } from '@/features/editor/state/editor-document-state'
import { useEditorWorkspaceStoreApi } from '@/features/editor/state/editor-workspace-state'
import { useResetWorkspaceTreeLoad } from '@/hooks/use-workspace-tree'
import { reportError, toClientError } from '@/lib/client-error-taxonomy'
import { log } from '@/lib/client-logging'
import { statPath } from '@/lib/file-server'

export type OpenWorkspaceRootResult =
  | 'already-open'
  | 'declined'
  | 'failed'
  | 'opened'
  | 'superseded'

/**
 * Opens a workspace root by path. Projects are known by path — from a chat session,
 * from the project menu — but the workspace wants a picked entry, so the path is
 * resolved against the file server first.
 *
 * App-level on purpose: the titlebar's project menu and the chat rail both switch
 * projects, and neither should have to reach into the other's feature.
 */
export function useOpenWorkspaceRoot() {
  const { pickRootFolder } = useEditorCommands()
  const documentStore = useEditorDocumentStoreApi()
  const resetTreeLoad = useResetWorkspaceTreeLoad()
  const workspaceStore = useEditorWorkspaceStoreApi()

  return useCallback(
    async (
      workspaceRoot: string,
      { isCurrent = alwaysCurrent }: { isCurrent?: () => boolean } = {},
    ): Promise<OpenWorkspaceRootResult> => {
      if (workspaceStore.getState().rootFolder?.path === workspaceRoot) return 'already-open'
      if (!confirmDiscardingUnsavedWork(documentStore.getState().dirtyFilePaths)) return 'declined'

      const controller = new AbortController()
      try {
        const entry = await statPath(workspaceRoot, controller.signal)
        // A later request already claimed the workspace; landing now would drag it back.
        if (!isCurrent()) {
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
        pickRootFolder({ ...entry, name: pathLeaf(workspaceRoot), type: 'directory' })
        log.info({ action: 'workspace.root_opened', area: 'workspace', path: workspaceRoot })
        return 'opened'
      } catch (error) {
        reportError(toClientError(error))
        return 'failed'
      }
    },
    [documentStore, pickRootFolder, resetTreeLoad, workspaceStore],
  )
}

function alwaysCurrent() {
  return true
}

function pathLeaf(path: string) {
  return path.split('/').filter(Boolean).at(-1) ?? path
}
