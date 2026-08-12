import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import {
  useEditorWorkspaceState,
  useEditorWorkspaceStoreApi,
} from '@/features/editor/state/editor-workspace-state'
import { useOpenWorkspaceRoot, type OpenWorkspaceRootResult } from '@/hooks/use-open-workspace-root'
import { log } from '@/lib/client-logging'
import { recentFoldersQueryOptions } from '@/lib/recent-folders-query'

/**
 * Browser storage only remembers the active root locally. When it is missing, the
 * file server's newest recent directory is the next-best durable source of truth.
 */
export function useRestoreRecentWorkspaceRoot() {
  const rootPath = useEditorWorkspaceState((state) => state.rootFolder?.path ?? null)
  const workspaceStore = useEditorWorkspaceStoreApi()
  const openWorkspaceRoot = useOpenWorkspaceRoot()
  const attemptedRootPath = useRef<string | null>(null)
  const recentFolders = useQuery(recentFoldersQueryOptions({ enabled: rootPath === null }))
  const recentRootPath = recentFolders.data?.[0]?.path ?? null

  useEffect(() => {
    if (rootPath !== null) {
      attemptedRootPath.current = null
      return
    }
    if (!recentRootPath) return
    if (attemptedRootPath.current === recentRootPath) return
    if (workspaceStore.getState().rootFolder) return

    attemptedRootPath.current = recentRootPath
    void restoreRecentWorkspaceRoot(recentRootPath, openWorkspaceRoot)
  }, [openWorkspaceRoot, recentRootPath, rootPath, workspaceStore])
}

async function restoreRecentWorkspaceRoot(
  rootPath: string,
  openWorkspaceRoot: (rootPath: string) => Promise<OpenWorkspaceRootResult>,
) {
  const result = await openWorkspaceRoot(rootPath)
  if (result !== 'opened') return

  log.info({
    action: 'workspace.root_restored_from_recents',
    area: 'workspace',
    path: rootPath,
  })
}
